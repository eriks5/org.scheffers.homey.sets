"use strict";

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

let intervalHandle = null;

// Homey API

function trigger(name, state){
  Homey.manager('flow').trigger(name, {}, state);
  console.log(`Triggered flow: "${name}"`, state);
}

function updateApi(name, data){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  Homey.manager('api').realtime(name, data);
  console.log(`API realtime update: "${name}"`, name, data);
}

function getSettings(name){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  return Homey.manager('settings').get(name);
}

function updateSettings(name, data){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  Homey.manager('settings').set(name, data);
  console.log(`Settings update: "${name}"`, name, data);
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

function getProperty(setId, propName){
  // Get a property of a set
  let set = (getSettings('sets') || {})[setId];
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

function getSetsState(){
  let sets = [];
  const setsSetting = getSettings('sets') || {};
  for (let setId in setsSetting){
    if (setsSetting.hasOwnProperty(setId)){
      sets.push(getSetState(setId, setsSetting[setId]));
    }
  }

  return sets;
}

function triggerStateChange(setId, stateId, oldState, newState){
  if (newState) {
    trigger('state_set', {setId, stateId, trigger: 'always'});
  }
  else if (oldState){
    trigger('state_reset', {setId, stateId, trigger: 'always'});
  }

  if (oldState !== newState){
    if (newState && !oldState){
      trigger('state_set', {setId, stateId, trigger: 'changed'});
    }
    if (oldState && !newState){
      trigger('state_reset', {setId, stateId, trigger: 'changed'});
    }
  }
}

function triggerNoneAll(setId, type, oldState, newState){
  !oldState && newState && trigger(type+'_active', {setId});
  oldState && !newState && trigger('not_'+type+'_active', {setId});
  oldState !== newState && trigger(type+'_active_changed', {setId});
}

function triggerChange(setId){
  trigger('change', {setId});
}

function updateStateUseCount(stateId, change){
  // Update use counter of state
  // If use becomes zero, delete the state
  let states = getSettings('states') || {};
  let state = states[stateId];

  if (state){
    state.use += change;
    if (state.use <= 0){
      let stateLabels = getSettings('stateLabels') || {};
      delete stateLabels[state.label];
      updateApi('states_changed', {[stateId]: null});
      updateSettings('stateLabels', stateLabels);
      delete states[stateId];
    }

    updateSettings('states', states);
  }
}

function clearAllTimers(setId) {
  const allTimers = getSettings('timers') || {};

  if (allTimers.hasOwnProperty(setId)) {
    delete allTimers[setId];
    console.log('timers', setId, 'deleted');
    updateApi('timers_changed', allTimers);
    updateSettings('timers', allTimers);
  }
}

function getState(setId, stateId){
  const states = getProperty(setId, 'states');
  if (states){
    stateId = ""+stateId;

    if (states.hasOwnProperty(stateId)) {
      return states[stateId];
    }

    // Add missing state
    updateSet(setId, stateId);
    return false;
  }

  return null;
}

function updateSet(setId, stateId, newState, del) {
  // Update set to new state.
  // If newState === null toggles existing state
  // If newState === undefined state is not updated
  // When del === true, delete state from set
  let sets = getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    console.log('updateSet with invalid setId', setId);
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

  console.log('updateSet set', setId, ' stateId='+stateId, 'newState='+newState);

  // Update set
  const newStateBool = !!newState;
  if (del || newStateBool !== oldState) {
    if (del) {
      delete set.states[stateId];
      updateStateUseCount(stateId, -1);
    }
    else {
      if (!set.states.hasOwnProperty(stateId)) {
        updateStateUseCount(stateId, 1);
      }

      set.states[stateId] = newStateBool;
    }

    set.none = allStates(set.states, false);
    set.all = allStates(set.states, true);
    set.active = countActive(set.states);

    updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    updateSettings('sets', sets);
  }

  // Update timers
  if (newState !== oldState) {
    let changed = false;
    let allTimers = getSettings('timers') || {};
    let setTimers = allTimers[setId] || {};

    if (isNumber(newState)){
      if (setTimers[stateId] !== newState) {
        setTimers[stateId] = newState;
        console.log('timers ', setId, '=', setTimers);
        changed = true;
      }
    }
    else if (setTimers.hasOwnProperty(stateId)){
      delete setTimers[stateId];
      if (isEmptyObject(setTimers)){
        console.log('timers', setId, 'deleted');
        delete allTimers[setId];
      }

      changed = true;
    }

    if (changed) {
      allTimers[setId] = setTimers;
      updateApi('timers_changed', allTimers);
      updateSettings('timers', allTimers);
    }
  }

  // Trigger flows
  if (newState || oldState) {
    triggerStateChange(setId, stateId, oldState, newState);

    triggerNoneAll(setId, 'none', oldNone, set.none);
    triggerNoneAll(setId, 'all', oldAll, set.all);
  }
  newState !== oldState && triggerChange(setId);

  return true;
}

function setAll(setId, state){
  let sets = getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    console.log('setAll with invalid setId', setId);
    return false;
  }

  console.log('setAll set', setId, 'to', state);

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

  console.log('set', setId, '=', set);
  if (changed){
    updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    updateSettings('sets', sets);
  }

  clearAllTimers(setId);

  // Trigger flows for every change
  for (let id in oldStates) {
    if (oldStates.hasOwnProperty(id)) {
      triggerStateChange(setId, id, oldStates[id], state);
    }
  }

  triggerNoneAll(setId, 'none', oldNone, set.none);
  triggerNoneAll(setId, 'all', oldAll, set.all);
  changed && triggerChange(setId);

  return true;
}

function setExactlyOne(setId, stateId){
  // Set one state, reset all other states
  let sets = getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    console.log('setExactlyOne with invalid setId', setId);
    return false;
  }

  if (!set.states.hasOwnProperty(stateId)){
    console.log('setExactlyOne with invalid stateId', stateId);
    return false;
  }

  console.log('setExactlyOne set', setId, 'state', stateId);

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

  console.log('set', setId, '=', set);
  if (changed){
    updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    updateSettings('sets', sets);
  }

  clearAllTimers(setId);

  // Trigger flows for every change
  for (let id in oldStates) {
    if (oldStates.hasOwnProperty(id)) {
      triggerStateChange(setId, id, oldStates[id], id === stateId);
    }
  }

  triggerNoneAll(setId, 'none', oldNone, set.none);
  triggerNoneAll(setId, 'all', oldAll, set.all);
  changed && triggerChange(setId);

  return true;
}

//noinspection JSUnresolvedVariable
function setDelay(setId, stateId, delay) {
  let allTimers = getSettings('timers') || {};
  let setTimers = allTimers[setId] || {};

  setTimers[stateId] = -delay;
  console.log('timers ', setId, '=', setTimers);

  allTimers[setId] = setTimers;
  updateApi('timers_changed', allTimers);
  updateSettings('timers', allTimers);
}

function compareAutoCompletionFn(l, r){
  return l.name.toLowerCase().localeCompare(r.name.toLowerCase());
}

function tickTock(){
  // Decrease every timer
  let allTimers = getSettings('timers');
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

  updateApi('timers_changed', allTimers);
  updateSettings('timers', allTimers);

  // Update states of expired states
  if (!isEmptyObject(newStates)){
    let sets = getSettings('sets') || {};
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

        console.log('set', setId, '=', set);
        apiChanges[setId] = getSetState(setId, set);
      }
    }

    updateApi('sets_changed', apiChanges);
    updateSettings('sets', sets);

    // Trigger flows for every changed set
    for (let setId in newStates) {
      if (newStates.hasOwnProperty(setId)){
        const newState = newStates[setId];
        for (let stateId in newState) {
          if (newState.hasOwnProperty(stateId)){
            triggerStateChange(setId, stateId, !newState[stateId], newState[stateId]);
          }
        }
        triggerNoneAll(setId, 'none', wasNone[setId], sets[setId].none);
        triggerNoneAll(setId, 'all', wasAll[setId], sets[setId].all);
        triggerChange(setId);
      }
    }
  }
}

module.exports = {
  init() {
    intervalHandle = setInterval(tickTock, 1000);
    console.log('setManager initialized');

    console.log('=======================');
    for (const key of Homey.manager('settings').getKeys()){
      console.log(`${key}:`);
      console.log(Homey.manager('settings').get(key));
      console.log('=======================');
    }
  },

  getSetId(label, setId){
    // Get id for set with given label
    // If setId is given, recreate a set with that id if it does not exist
    if (!(label = normaliseLabel(label))){
      return false;
    }

    let setLabels = getSettings('setLabels') || {};
    let sets = getSettings('sets') || {};

    if (!setId){
      setId = setLabels[label] || getUUID();
    }
    if (!sets[setId] && !setLabels[label]){
      console.log('New setId', setId, 'for set "'+label+'"');

      const set = {
        label: label,
        states: {},
        none: true,
        all: true,
        active: 0,
      };

      sets[setId] = set;
      console.log('set', setId, '=', sets[setId]);
      updateApi('sets_changed', {[setId]: getSetState(setId, set)});
      updateSettings('sets', sets);

      setLabels[label] = setId;
      updateSettings('setLabels', setLabels);
    }

    return setId;
  },

  deleteSet(setId){
    setId = ""+setId;

    let sets = getSettings('sets') || {};
    let set = sets[setId];

    if (set) {
      if (set.states && !isEmptyObject(set.states)) {
        console.log('Delete setId', setId, 'failed: not empty');
        return false;
      }

      delete sets[setId];
      updateApi('sets_changed', {[setId]: null});
      updateSettings('sets', sets);
      console.log('Deleted setId', setId);

      let setLabels = getSettings('setLabels') || {};
      delete setLabels[set.label];
      updateSettings('setLabels', setLabels);

      const timers = getSettings('timers') || {};
      if (timers.hasOwnProperty(setId)) {
        delete timers[setId];
        console.log('timers', setId, 'deleted');
        updateSettings('timers', timers);
      }
    }

    return true;
  },

  getStateId(label, stateId){
    // Get id for state with given label
    // If stateId is given, recreate a state with that id if it does not exist
    if (!(label = normaliseLabel(label))){
      return false;
    }

    let stateLabels = getSettings('stateLabels') || {};
    let states = getSettings('states') || {};

    if (!stateId){
      stateId = stateLabels[label] || getUUID();
    }
    if (!states[stateId] && !stateLabels[label]){
      stateLabels[label] = stateId;
      updateSettings('stateLabels', stateLabels);

      states[stateId] = {
        label: label,
        use: 0,
      };
      updateApi('states_changed', {[stateId]: label});
      updateSettings('states', states);
    }

    return stateId;
  },

  // No 'deleteState' method; states get deleted when they are no longer in use in any set

  getState(setId, stateId){
    // Get state
    // Returns:
    //    true: state is active
    //    false: state is not active
    //    null: set or state invalid
    return getState(""+setId, ""+stateId)
  },

  getTimeout(setId, stateId){
    // Get timeout for state
    const allTimers = getSettings('timers') || {};
    const setTimers = allTimers[""+setId] || {};
    return setTimers[""+stateId] || 0;
  },

  getSetLabel(setId){
    getProperty(""+setId, 'label');
  },

  getStateLabel(stateId){
    stateId = ""+stateId;

    const states = getSettings('states');
    if (states && states.hasOwnProperty(stateId)) {
      return states[stateId].label;
    }
    return null;
  },

  getNone(setId){
    return getProperty(""+setId, 'none');
  },

  getAll(setId){
    return getProperty(""+setId, 'all');
  },

  getActive(setId){
    return getProperty(""+setId, 'active');
  },

  getFullState(){
    // Get current state for settings page
    let sets = getSetsState();

    let states = {};
    const statesSetting = getSettings('states') || {};
    for (let stateId in statesSetting){
      if (statesSetting.hasOwnProperty(stateId)){
        states[stateId] = statesSetting[stateId].label;
      }
    }

    let timers = getSettings('timers') || {};

    return {states, sets, timers}
  },

  addState(setId, stateId){
    // Add a state to a set
    return updateSet(""+setId, ""+stateId);
  },

  setState(setId, stateId, state){
    // Set state state
    return updateSet(""+setId, ""+stateId, state);
  },

  deleteState(setId, stateId){
    // Delete a state from a set
    // Afterwards the given stateId is not a valid state for the given set anymore
    // If the state is not used in other sets, it is deleted as well
    return updateSet(""+setId, ""+stateId, null, true);
  },

  setAll(setId, state){
    return setAll(""+setId, state);
  },

  setExactlyOne(setId, stateId){
    return setExactlyOne(""+setId, ""+stateId);
  },

  setDelayed(setId, stateId, delay){
    setId = ""+setId;
    stateId = ""+stateId;

    if (delay <= 0){
      setState(setId, stateId, true);
    }
    else if (getState(setId, stateId) === false){
      setDelay(setId, stateId, delay);
    }
  },

  autoCompleteSet(partial){
    let results = [];

    partial = partial.toLowerCase();

    const sets = getSettings('sets') || {};

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
  },

  autoCompleteState(setId, partial){
    let results = [];

    partial = partial.toLowerCase();

    const sets = getSettings('sets') || {};
    const set = sets[""+setId];

    if (set){
      const states = getSettings('states') || {};
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
};
