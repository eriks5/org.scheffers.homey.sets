"use strict";

const Homey = require('homey');

const initFlows = require('./lib/flow.js');

/*
Settings datastructure
  stateLabels (label (string) => id): mapping from state labels to ids
  states: id => {
    label (string): label of the state
    use (number): number of sets using this state
  }

  setLabels (label (string) => id): mapping from set labels to ids
  sets: id => {
    label (string): label of the set
    states (id => state (bool)): mapping from state id to state
    none (bool): all states are false
    all (bool): all states are true
    active (bool): number of true states
  }

  timers (setId => (stateId => timeout (number)): timeouts (positive) or delays (negative)

*/

// Homey API

function log(){
  // noinspection JSUnresolvedVariable
  if (Homey.env.DEBUG){
    console.log.apply(console, arguments);
  }
}

async function trigger(name, state){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  await Homey.app.triggers[name].trigger({}, state);
  log(`Triggered flow: "${name}"`, state);
}

async function updateApi(name, data){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  await Homey.ManagerApi.realtime(name, data);
  log(`API realtime update: "${name}"`, name, data);
}

function getSettings(name){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  return Homey.ManagerSettings.get(name);
}

async function updateSettings(name, data){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  await Homey.ManagerSettings.set(name, data);
  log(`Settings update: "${name}"`, name, data);
}

// Utils

function normaliseLabel(label){
  if (typeof label === "string"){
    return label.replace(/\s+/g, ' ').trim();
  }
  return false;
}

function getUUID(){
  // https://gist.github.com/jed/982883
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,a=>(a^Math.random()*16>>a/4).toString(16));
}

function allStates(states, state){
  // Return true when all items in the object have the same state
  const hasState = state ? el => el : el => !el;
  for (let stateId in states){
    if (states.hasOwnProperty(stateId) && !hasState(states[stateId])){
      return false;
    }
  }
  return true;
}

async function getProperty(setId, propName){
  // Get a property of a set
  let set = (await getSettings('sets') || {})[setId];
  return set ? set[propName] : null;
}

function countActive(states){
  // Count number of states where state is true
  let count = 0;
  for (let stateId in states){
    if (states.hasOwnProperty(stateId) && states[stateId]){
      count += 1;
    }
  }
  return count;
}

function isUndefined(value){
  return typeof value === 'undefined';
}

function isNumber(value){
  return typeof value === 'number';
}

function getObjectSize(value){
  return Object.keys(value).length;
}

function isEmptyObject(value){
  return getObjectSize(value) === 0;
}

function getSetState(setId, set){
  return {
    id: setId,
    label: set.label,
    states: set.states
  }
}

async function getSetsState(){
  let sets = [];
  const setsSetting = await getSettings('sets') || {};
  for (let setId in setsSetting){
    if (setsSetting.hasOwnProperty(setId)){
      sets.push(await getSetState(setId, setsSetting[setId]));
    }
  }

  return sets;
}

async function triggerStateChange(setId, stateId, oldState, newState){
  if (newState) {
    await trigger('state_set', {setId, stateId, trigger: 'always'});
  }
  else if (oldState){
    await trigger('state_reset', {setId, stateId, trigger: 'always'});
  }

  if (oldState !== newState){
    if (newState && !oldState){
      await trigger('state_set', {setId, stateId, trigger: 'changed'});
    }
    if (oldState && !newState){
      await trigger('state_reset', {setId, stateId, trigger: 'changed'});
    }
  }
}

async function triggerNoneAll(setId, type, oldState, newState){
  !oldState && newState && await trigger(type+'_active', {setId});
  oldState && !newState && await trigger('not_'+type+'_active', {setId});
  oldState !== newState && await trigger(type+'_active_changed', {setId});
}

function triggerChange(setId){
  return trigger('change', {setId});
}

async function updateStateUseCount(stateId, change){
  // Update use counter of state
  // If use becomes zero, delete the state
  let states = await getSettings('states') || {};
  let state = states[stateId];

  if (state){
    state.use += change;
    if (state.use <= 0){
      let stateLabels = await getSettings('stateLabels') || {};
      delete stateLabels[state.label];
      await updateApi('states_changed', {[stateId]: null});
      await updateSettings('stateLabels', stateLabels);
      delete states[stateId];
    }

    await updateSettings('states', states);
  }
}

async function clearAllTimers(setId) {
  const allTimers = await getSettings('timers') || {};

  if (allTimers.hasOwnProperty(setId)) {
    delete allTimers[setId];
    log('timers', setId, 'deleted');
    await updateApi('timers_changed', allTimers);
    await updateSettings('timers', allTimers);
  }
}

async function getState(setId, stateId){
  const states = await getProperty(setId, 'states');
  if (states){
    stateId = ""+stateId;

    if (states.hasOwnProperty(stateId)) {
      return states[stateId];
    }

    // Add missing state
    await updateSet(setId, stateId);
    return false;
  }

  return null;
}

async function updateSet(setId, stateId, newState, del) {
  // Update set to new state.
  // If newState === null toggles existing state
  // If newState === undefined state is not updated
  // When del === true, delete state from set
  let sets = await getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    log('updateSet with invalid setId', setId);
    return false;
  }

  const oldState = set.states[stateId];
  if (!del && isUndefined(newState) && !isUndefined(oldState)){
    return true;
  }

  const oldNone = set.none;
  const oldAll = set.all;

  if (del){
    newState = undefined;
  }
  else if (newState === null){
    newState = !oldState;
  }
  else if (isUndefined(newState) || (isNumber(newState) && newState <= 0)){
    newState = false;
  }

  log('updateSet set', setId, ' stateId='+stateId, 'newState='+newState);

  // Update set
  const newStateBool = !!newState;
  if (del || newStateBool !== oldState) {
    if (del) {
      delete set.states[stateId];
      await updateStateUseCount(stateId, -1);
    }
    else {
      if (!set.states.hasOwnProperty(stateId)) {
        await updateStateUseCount(stateId, 1);
      }

      set.states[stateId] = newStateBool;
    }

    set.none = allStates(set.states, false);
    set.all = allStates(set.states, true);
    set.active = countActive(set.states);

    await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    await updateSettings('sets', sets);
  }

  // Update timers
  if (newState !== oldState) {
    let changed = false;
    let allTimers = await getSettings('timers') || {};
    let setTimers = allTimers[setId] || {};

    if (isNumber(newState)){
      if (setTimers[stateId] !== newState) {
        setTimers[stateId] = newState;
        log('timers ', setId, '=', setTimers);
        changed = true;
      }
    }
    else if (setTimers.hasOwnProperty(stateId)){
      delete setTimers[stateId];
      if (isEmptyObject(setTimers)){
        log('timers', setId, 'deleted');
        delete allTimers[setId];
      }

      changed = true;
    }

    if (changed) {
      allTimers[setId] = setTimers;
      await updateApi('timers_changed', allTimers);
      await updateSettings('timers', allTimers);
    }
  }

  // Trigger flows
  if (newState || oldState) {
    await triggerStateChange(setId, stateId, oldState, newState);

    await triggerNoneAll(setId, 'none', oldNone, set.none);
    await triggerNoneAll(setId, 'all', oldAll, set.all);
  }
  newState !== oldState && await triggerChange(setId);

  return true;
}

async function setAll(setId, state){
  let sets = await getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    log('setAll with invalid setId', setId);
    return false;
  }

  log('setAll set', setId, 'to', state);

  let states = set.states;

  const oldNone = set.none;
  const oldAll = set.all;
  let changed = false;

  // Set every state, remember the old state to trigger flows later
  let oldStates = {};
  for (let id in states) {
    if (states.hasOwnProperty(id)) {
      const oldState = states[id];
      oldStates[id] = oldState;
      states[id] = state;
      changed |= (state !== oldState);
    }
  }

  set.none = !state;
  set.all = state;
  set.active = state ? getObjectSize(states) : 0;

  log('set', setId, '=', set);
  if (changed){
    await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    await updateSettings('sets', sets);
  }

  await clearAllTimers(setId);

  // Trigger flows for every change
  for (let id in oldStates) {
    if (oldStates.hasOwnProperty(id)) {
      await triggerStateChange(setId, id, oldStates[id], state);
    }
  }

  await triggerNoneAll(setId, 'none', oldNone, set.none);
  await triggerNoneAll(setId, 'all', oldAll, set.all);
  changed && await triggerChange(setId);

  return true;
}

async function setExactlyOne(setId, stateId){
  // Set one state, reset all other states
  let sets = await getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    log('setExactlyOne with invalid setId', setId);
    return false;
  }

  if (!set.states.hasOwnProperty(stateId)){
    log('setExactlyOne with invalid stateId', stateId);
    return false;
  }

  log('setExactlyOne set', setId, 'state', stateId);

  let states = set.states;

  const oldNone = set.none;
  const oldAll = set.all;
  let changed = false;

  // Set every state, remember the old state to trigger flows later
  let oldStates = {};
  for (let id in states) {
    if (states.hasOwnProperty(id)) {
      const oldState = states[id];
      const state = (id === stateId);
      oldStates[id] = oldState;
      states[id] = state;
      changed |= (state !== oldState);
    }
  }

  set.none = false;
  set.all = getObjectSize(states) === 1;
  set.active = 1;

  log('set', setId, '=', set);
  if (changed){
    await updateApi('sets_changed', {[setId]: await getSetState(setId, set)});
    await updateSettings('sets', sets);
  }

  await clearAllTimers(setId);

  // Trigger flows for every change
  for (let id in oldStates) {
    if (oldStates.hasOwnProperty(id)) {
      await triggerStateChange(setId, id, oldStates[id], id === stateId);
    }
  }

  await triggerNoneAll(setId, 'none', oldNone, set.none);
  await triggerNoneAll(setId, 'all', oldAll, set.all);
  changed && await triggerChange(setId);

  return true;
}

//noinspection JSUnresolvedVariable
async function setDelay(setId, stateId, delay) {
  let allTimers = await getSettings('timers') || {};
  let setTimers = allTimers[setId] || {};

  setTimers[stateId] = -delay;
  log('timers ', setId, '=', setTimers);

  allTimers[setId] = setTimers;
  await updateApi('timers_changed', allTimers);
  await updateSettings('timers', allTimers);
}

function compareAutoCompletionFn(l, r){
  return l.name.toLowerCase().localeCompare(r.name.toLowerCase());
}

async function tickTock(){
  // Decrease every timer
  let allTimers = await getSettings('timers');
  if (!allTimers || isEmptyObject(allTimers)){
    return;
  }

  let newStates = {};
  for (let setId in allTimers){
    if (allTimers.hasOwnProperty(setId)){
      let newState = {};

      let setTimers = allTimers[setId];
      for (let stateId in setTimers){
        if (setTimers.hasOwnProperty(stateId)){
          let timer = setTimers[stateId];
          if (timer >= 0){
            timer -= 1;
            if (timer === 0){
              newState[stateId] = false;
            }
          }
          else {
            timer += 1;
            if (timer === 0){
              newState[stateId] = true;
            }
          }

          if (timer === 0){
            delete setTimers[stateId];
          }
          else {
            setTimers[stateId] = timer;
          }
        }
      }

      if (!isEmptyObject(newState)){
        newStates[setId] = newState;
      }
      if (isEmptyObject(setTimers)){
        delete allTimers[setId];
      }
    }
  }

  await updateApi('timers_changed', allTimers);
  await updateSettings('timers', allTimers);

  // Update states of expired states
  if (!isEmptyObject(newStates)){
    let sets = await getSettings('sets') || {};
    let wasAll = {}, wasNone = {}, apiChanges = {};

    for (let setId in newStates) {
      if (newStates.hasOwnProperty(setId)) {
        const newState = newStates[setId];
        let set = sets[setId];
        wasAll[setId] = set.all;
        wasNone[setId] = set.none;

        for (let stateId in newState) {
          if (newState.hasOwnProperty(stateId)){
            set.states[stateId] = newState[stateId];
          }
        }

        set.none = allStates(set.states, false);
        set.all = allStates(set.states, true);
        set.active = countActive(set.states);

        log('set', setId, '=', set);
        apiChanges[setId] = await getSetState(setId, set);
      }
    }

    await updateApi('sets_changed', apiChanges);
    await updateSettings('sets', sets);

    // Trigger flows for every changed set
    for (let setId in newStates) {
      if (newStates.hasOwnProperty(setId)){
        const newState = newStates[setId];
        for (let stateId in newState) {
          if (newState.hasOwnProperty(stateId)){
            await triggerStateChange(setId, stateId, !newState[stateId], newState[stateId]);
          }
        }
        await triggerNoneAll(setId, 'none', wasNone[setId], sets[setId].none);
        await triggerNoneAll(setId, 'all', wasAll[setId], sets[setId].all);
        await triggerChange(setId);
      }
    }
  }
}

class SetsApp extends Homey.App {
  // noinspection JSUnusedGlobalSymbols
  onInit() {
    this.triggers = initFlows();

    log('=======================');
    // noinspection JSUnresolvedVariable, JSUnresolvedFunction
    for (const key of Homey.ManagerSettings.getKeys()){
      log(`${key}:`);
      // noinspection JSUnresolvedVariable
      log(Homey.ManagerSettings.get(key));
      log('=======================');
    }

    setInterval(() => tickTock().then().catch(e => {throw(e)}), 1000);
  }

  // noinspection JSMethodCanBeStatic
  async getSetId(label, setId){
    // Get id for set with given label
    // If setId is given, recreate a set with that id if it does not exist
    if (!(label = normaliseLabel(label))){
      return false;
    }

    let setLabels = await getSettings('setLabels') || {};
    let sets = await getSettings('sets') || {};

    if (!setId){
      setId = setLabels[label] || getUUID();
    }
    if (!sets[setId] && !setLabels[label]){
      log('New setId', setId, 'for set "'+label+'"');

      const set = {
        label: label,
        states: {},
        none: true,
        all: true,
        active: 0,
      };

      sets[setId] = set;
      log('set', setId, '=', sets[setId]);
      await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
      await updateSettings('sets', sets);

      setLabels[label] = setId;
      await updateSettings('setLabels', setLabels);
    }

    return setId;
  }

  // noinspection JSMethodCanBeStatic
  async deleteSet(setId){
    setId = ""+setId;

    let sets = await getSettings('sets') || {};
    let set = sets[setId];

    if (set) {
      if (set.states && !isEmptyObject(set.states)) {
        log('Delete setId', setId, 'failed: not empty');
        return false;
      }

      delete sets[setId];
      await updateApi('sets_changed', {[setId]: null});
      await updateSettings('sets', sets);
      log('Deleted setId', setId);

      let setLabels = await getSettings('setLabels') || {};
      delete setLabels[set.label];
      await updateSettings('setLabels', setLabels);

      const timers = await getSettings('timers') || {};
      if (timers.hasOwnProperty(setId)) {
        delete timers[setId];
        log('timers', setId, 'deleted');
        await updateSettings('timers', timers);
      }
    }

    return true;
  }

  // noinspection JSMethodCanBeStatic
  async getStateId(label, stateId){
    // Get id for state with given label
    // If stateId is given, recreate a state with that id if it does not exist
    if (!(label = normaliseLabel(label))){
      return false;
    }

    let stateLabels = await getSettings('stateLabels') || {};
    let states = await getSettings('states') || {};

    if (!stateId){
      stateId = stateLabels[label] || getUUID();
    }
    if (!states[stateId] && !stateLabels[label]){
      stateLabels[label] = stateId;
      await updateSettings('stateLabels', stateLabels);

      states[stateId] = {
        label: label,
        use: 0,
      };
      await updateApi('states_changed', {[stateId]: label});
      await updateSettings('states', states);
    }

    return stateId;
  }

  // No 'deleteState' method; states get deleted when they are no longer in use in any set

  // noinspection JSMethodCanBeStatic
  getState(setId, stateId){
    // Get state
    // Returns a Promise that resolves to:
    //    true: state is active
    //    false: state is not active
    //    null: set or state invalid
    return getState(""+setId, ""+stateId)
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  async getTimeout(setId, stateId){
    // Get timeout for state
    const allTimers = await getSettings('timers') || {};
    const setTimers = allTimers[""+setId] || {};
    return setTimers[""+stateId] || 0;
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  getSetLabel(setId){
    return getProperty(""+setId, 'label');
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  async getStateLabel(stateId){
    stateId = ""+stateId;

    const states = await getSettings('states');
    if (states && states.hasOwnProperty(stateId)) {
      return states[stateId].label;
    }
    return null;
  }

  // noinspection JSMethodCanBeStatic
  getNone(setId){
    return getProperty(""+setId, 'none');
  }

  // noinspection JSMethodCanBeStatic
  getAll(setId){
    return getProperty(""+setId, 'all');
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  getActive(setId){
    return getProperty(""+setId, 'active');
  }

  // noinspection JSMethodCanBeStatic
  async getFullState(){
    // Get current state for settings page
    let sets = await getSetsState();

    let states = {};
    const statesSetting = await getSettings('states') || {};
    for (let stateId in statesSetting){
      if (statesSetting.hasOwnProperty(stateId)){
        states[stateId] = statesSetting[stateId].label;
      }
    }

    let timers = await getSettings('timers') || {};

    return {states, sets, timers}
  }

  // noinspection JSMethodCanBeStatic
  addState(setId, stateId){
    // Add a state to a set
    return updateSet(""+setId, ""+stateId);
  }

  // noinspection JSMethodCanBeStatic
  async copyStates(fromSetId, toSetId){
    // Copy states from one set to another
    // Both sets must exist, and the target set cannot have any states yet.
    fromSetId = ""+fromSetId;
    toSetId = ""+toSetId;

    let sets = await getSettings('sets') || {};
    let fromSet = sets[fromSetId];
    let toSet = sets[toSetId];

    if (fromSet && toSet && isEmptyObject(toSet.states)){
      const fromStates = fromSet.states;
      for (let stateId in fromStates){
        if (fromStates.hasOwnProperty(stateId)){
          await updateSet(toSetId, stateId);
        }
      }
    }
  }

  // noinspection JSMethodCanBeStatic
  setState(setId, stateId, state){
    // Set state state
    return updateSet(""+setId, ""+stateId, state);
  }

  // noinspection JSMethodCanBeStatic
  deleteState(setId, stateId){
    // Delete a state from a set
    // Afterwards the given stateId is not a valid state for the given set anymore
    // If the state is not used in other sets, it is deleted as well
    return updateSet(""+setId, ""+stateId, null, true);
  }

  // noinspection JSMethodCanBeStatic
  setAll(setId, state){
    return setAll(""+setId, state);
  }

  // noinspection JSMethodCanBeStatic
  setExactlyOne(setId, stateId){
    return setExactlyOne(""+setId, ""+stateId);
  }

  // noinspection JSMethodCanBeStatic
  async setDelayed(setId, stateId, delay){
    setId = ""+setId;
    stateId = ""+stateId;

    if (delay <= 0){
      await updateSet(setId, stateId, true);
    }
    else if (await getState(setId, stateId) === false){
      await setDelay(setId, stateId, delay);
    }
  }

  // noinspection JSMethodCanBeStatic
  async autoCompleteSet(partial){
    let results = [];

    partial = partial.toLowerCase();

    const sets = await getSettings('sets') || {};

    for (let setId in sets){
      if (sets.hasOwnProperty(setId)){
        const set = sets[setId];
        if (set.label.toLowerCase().startsWith(partial)){
          results.push({
            name: set.label,
            id: setId
          });
        }
      }
    }

    results.sort(compareAutoCompletionFn);
    return results;
  }

  // noinspection JSMethodCanBeStatic
  async autoCompleteState(setId, partial){
    let results = [];

    partial = partial.toLowerCase();

    const sets = await getSettings('sets') || {};
    const set = sets[""+setId];

    if (set){
      const states = await getSettings('states') || {};
      const setStates = set.states;
      for (let stateId in setStates){
        if (setStates.hasOwnProperty(stateId) && states.hasOwnProperty(stateId)){
          const state = states[stateId];
          const label = state && state.label;
          if (label && label.toLowerCase().startsWith(partial)){
            results.push({
              name: label,
              id: stateId
            });
          }
        }
      }

      results.sort(compareAutoCompletionFn);
    }

    return results;
  }
}

// noinspection JSUnresolvedVariable
module.exports = SetsApp;
