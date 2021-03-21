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

var setsAllTokens = {}, // Dynamic FlowTokens for this app
    setsAllTokensIndex = []; // index for FlowTokens
var flowTokenPrefix = 'FlowToken_', // Prefix for tokens
    flowTokenActive = 'Active_',
    flowTokenInactive = 'Inactive_',
    flowTokenCount = 'Count_',
    flowTokenTotal = 'Total_';
var labelPostfixActive = Homey.__("settings.label-postfix-active"),
    labelPostfixInactive = Homey.__("settings.label-postfix-inactive"),
    labelCount = Homey.__("settings.label-count"),
    labelTotal = Homey.__("settings.label-total");
const defaultSeparator = ', ';

function log(){
  // noinspection JSUnresolvedVariable
  if (Homey.env.DEBUG){
    console.log.apply(console, arguments);
  }
}

function updateToken(tokenName, tokenOptions, tokenValue){
  //log('tokenName:',tokenName,'tokenValue:',tokenValue);
  if( setsAllTokens[tokenName] === undefined ) {
    // token not in index, so register it
    setsAllTokensIndex.push(tokenName);
    setsAllTokens[tokenName] = new Homey.FlowToken(tokenName, tokenOptions);
    setsAllTokens[tokenName].register()
      .then(() => {
        //log('=======================');
        log('New token:',tokenName,'with value:',tokenValue);
        return setsAllTokens[tokenName].setValue(tokenValue );
      })
      .catch(console.error)
  }
  else {
    // token in index, so just return its value
    //log('=======================');
    log('Updated token:',tokenName,'with value:',tokenValue);
    return setsAllTokens[tokenName].setValue(tokenValue ).catch(console.error);
  }
}

function deleteToken(tokenName) {
  Homey.ManagerFlow.unregisterToken(setsAllTokens[tokenName])
    .then(() => {
      delete setsAllTokens[tokenName];
    })
    .catch( err => {
        console.log( err );
    })
}

function cleanupSetsAllTokens(setId){
  // remove FlowTokens for sets that have been removed
  let tokenName = flowTokenPrefix+flowTokenActive+setId;

  log('=======================');
  delete setsAllTokensIndex[tokenName];
  log('Token:', tokenName, 'removed from index');
  deleteToken(tokenName);
  log('Token:', tokenName, 'deleted');
  
  tokenName = flowTokenPrefix+flowTokenInactive+setId;
  delete setsAllTokensIndex[tokenName];
  log('Token:', tokenName, 'removed from index');
  deleteToken(tokenName);
  log('Token:', tokenName, 'deleted');
  
  tokenName = flowTokenPrefix+flowTokenActive+flowTokenCount+setId;
  delete setsAllTokensIndex[tokenName];
  log('Token:', tokenName, 'removed from index');
  deleteToken(tokenName);
  log('Token:', tokenName, 'deleted');
  
  tokenName = flowTokenPrefix+flowTokenInactive+flowTokenCount+setId;
  delete setsAllTokensIndex[tokenName];
  log('Token:', tokenName, 'removed from index');
  deleteToken(tokenName);
  log('Token:', tokenName, 'deleted');
  
  tokenName = flowTokenPrefix+flowTokenTotal+setId;
  delete setsAllTokensIndex[tokenName];
  log('Token:', tokenName, 'removed from index');
  deleteToken(tokenName);
  log('Token:', tokenName, 'deleted');

  log('=======================');

}

async function trigger(name, state){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  await Homey.app.triggers[name].trigger({}, state);
  log('=======================');
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

function updateSettings(name, data){
  //noinspection JSUnresolvedFunction,JSUnresolvedVariable
  Homey.ManagerSettings.set(name, data);
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

function listStates(setId, states, value){
  // Return a string with the state.label's whom are in state 'state' (either true or false)
  let list = '';
  const hasState = value ? el => !el : el => el;

  // Get a property of a set
  let set = (getSettings('sets') || {})[setId];
  if(set) {
    if(!set.hasOwnProperty('separator')) {
      log('set.separator: undefined');
      set.separator = defaultSeparator;
      log('new set.separator:', set.separator);
    }
  
    for (let stateId in states){
      //log('stateId:', stateId);
      if (states.hasOwnProperty(stateId) && !hasState(states[stateId])){
        const stateswlabels = getSettings('states');
        const label = stateswlabels[stateId].label;
        //log('label:', label);

        if ( list == "" ){
          list = label;
          //log('listStates', list, ' is empty');
        }
        else {
          list += (set.separator + label);
          //log('listStates', list);
        }
      }
    }
  }
  else {
    log('set is undefined')
    list = '';
  }
  return list;
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
    separator: set.separator,
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

async function triggerChange(setId){
  return await trigger('change', {setId});
}

async function updateStateUseCount(stateId, change){
  // Update use counter of state
  // If use becomes zero, delete the state
  let states = getSettings('states') || {};
  let state = states[stateId];

  if (state){
    state.use += change;
    if (state.use <= 0){
      let stateLabels = getSettings('stateLabels') || {};

      delete stateLabels[state.label];
      delete states[stateId];

      updateSettings('stateLabels', stateLabels);
      updateSettings('states', states);
      await updateApi('states_changed', {[stateId]: null});
    }
    else {
      updateSettings('states', states);
    }
  }
}

async function clearAllTimers(setId) {
  const allTimers = getSettings('timers') || {};

  if (allTimers.hasOwnProperty(setId)) {
    delete allTimers[setId];
    log('timers', setId, 'deleted');
    updateSettings('timers', allTimers);
    await updateApi('timers_changed', allTimers);
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

async function updateSeparator(setId, separatorText) {
  // Update set separator.
  let sets = getSettings('sets') || {};
  let set = sets[setId];
  if (!set){
    log('updateSet with invalid setId', setId);
    return false;
  }

  log('updateSeparator set', setId, ' separatorText='+set.separator, ' new separatorText='+separatorText);

  // Update separator
  set.separator = separatorText;
  log('set.separator:', set.separator);

  log('=======================');

  // Update the FlowTokens (list active states)
  var tokenName = flowTokenPrefix+flowTokenActive+setId;
  var tokenOptions = {
    type: 'string',
    title: ''+set.label+labelPostfixActive
  };
  var tokenValue = listStates(setId, set.states, true);
  updateToken(tokenName, tokenOptions, tokenValue);

  // Update the FlowTokens (list inactive states)
  tokenName = flowTokenPrefix+flowTokenInactive+setId;
  tokenOptions = {
    type: 'string',
    title: ''+set.label+labelPostfixInactive
  };
  tokenValue = listStates(setId, set.states, false);
  updateToken(tokenName, tokenOptions, tokenValue);

  log('=======================');

  updateSettings('sets', sets);
  }

  async function updateSet(setId, stateId, newState, del) {
    // Update set to new state.
    // If newState === null toggles existing state
    // If newState === undefined state is not updated
    // When del === true, delete state from set
    let sets = getSettings('sets') || {};
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
  
      updateSettings('sets', sets);
      await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
  
      // Update the FlowTokens (list active states)
      var tokenName = flowTokenPrefix+flowTokenActive+setId;
      var tokenOptions = {
        type: 'string',
        title: ''+set.label+labelPostfixActive
      };
      var tokenValue = listStates(setId, set.states, true);
      updateToken(tokenName, tokenOptions, tokenValue);
  
      // Update the FlowTokens (list inactive states)
      tokenName = flowTokenPrefix+flowTokenInactive+setId;
      tokenOptions = {
        type: 'string',
        title: ''+set.label+labelPostfixInactive
      };
      tokenValue = listStates(setId, set.states, false);
      updateToken(tokenName, tokenOptions, tokenValue);
  
      // Update the FlowTokens (count active states)
      var tokenName = flowTokenPrefix+flowTokenActive+flowTokenCount+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelPostfixActive+labelCount
      };
      var tokenValue = countActive(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);

      // Update the FlowTokens (count inactive states)
      var tokenName = flowTokenPrefix+flowTokenInactive+flowTokenCount+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelPostfixInactive+labelCount
      };
      var tokenValue = getObjectSize(set.states) - countActive(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);

      // Update the FlowTokens (total number of states)
      var tokenName = flowTokenPrefix+flowTokenInactive+flowTokenTotal+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelTotal
      };
      var tokenValue = getObjectSize(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);

      log('=======================');

    }
  
    // Update timers
  const allTimers = getSettings('timers') || {};
  const setTimers = allTimers[setId] || {};
  const hasTimer = setTimers.hasOwnProperty(stateId);
  if (newState !== oldState || hasTimer) {
    let changed = false;

    if (isNumber(newState)){
      if (setTimers[stateId] !== newState) {
        setTimers[stateId] = newState;
        log('timers ', setId, '=', setTimers);
        changed = true;
      }
    }
    else if (hasTimer){
      delete setTimers[stateId];
      if (isEmptyObject(setTimers)){
        log('timers', setId, 'deleted');
        delete allTimers[setId];
      }

      changed = true;
    }

    if (changed) {
      allTimers[setId] = setTimers;
      updateSettings('timers', allTimers);
      await updateApi('timers_changed', allTimers);
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
  let sets = getSettings('sets') || {};
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
    updateSettings('sets', sets);
    await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
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
  let sets = getSettings('sets') || {};
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
    updateSettings('sets', sets);
    await updateApi('sets_changed', {[setId]: await getSetState(setId, set)});
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
  let allTimers = getSettings('timers') || {};
  let setTimers = allTimers[setId] || {};

  setTimers[stateId] = -delay;
  log('timers ', setId, '=', setTimers);

  allTimers[setId] = setTimers;
  updateSettings('timers', allTimers);
  await updateApi('timers_changed', allTimers);
}

function compareAutoCompletionFn(l, r){
  return l.name.toLowerCase().localeCompare(r.name.toLowerCase());
}

async function tickTock(){
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

  if (isEmptyObject(newStates)) {
    updateSettings('timers', allTimers);
    await updateApi('timers_changed', allTimers);
  }
  else {
    // Update states of expired states
    let sets = getSettings('sets') || {};
    let wasAll = {}, wasNone = {}, apiChanges = {};

    for (let setId in newStates) {
      if (newStates.hasOwnProperty(setId)) {
        const newState = newStates[setId];
        let set = sets[setId];
        wasAll[setId] = set.all;
        wasNone[setId] = set.none;

        for (let stateId in newState) {
          if (newState.hasOwnProperty(stateId)) {
            set.states[stateId] = newState[stateId];
          }
        }

        set.none = allStates(set.states, false);
        set.all = allStates(set.states, true);
        set.active = countActive(set.states);

        log('set', setId, '=', set);
        apiChanges[setId] = getSetState(setId, set);
      }

    }

    updateSettings('sets', sets);
    updateSettings('timers', allTimers);
    await updateApi('sets_changed', apiChanges);
    await updateApi('timers_changed', allTimers);

    // Trigger flows for every changed set
    for (let setId in newStates) {
      if (newStates.hasOwnProperty(setId)) {
        const newState = newStates[setId];
        for (let stateId in newState) {
          if (newState.hasOwnProperty(stateId)) {
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

    // create the active/inactive tokens for each set
    var sets = Homey.ManagerSettings.get('sets');
    if (sets){
      for (const setId of Object.getOwnPropertyNames(sets)){
        const set = (getSettings('sets') || {})[setId];
        const states = set.states;
        const stateId = Object.getOwnPropertyNames(set.states)[0]; // only one (the first) state per set is enough
        const stateIdValue = (getSettings('states') || {})[stateId];
        //log('stateIdValue:',stateIdValue)
        if (states && states.hasOwnProperty(stateId)) {
          // create tags/tokens by updating the set's state (as-is)        
          updateSet(""+setId, ""+stateId, stateIdValue.use);
          log('=======================');
        }
      }
    }
    
    setInterval(() => tickTock().catch(e => {throw e}), 1000);
  }

  // noinspection JSMethodCanBeStatic
  async getSetId(label, setId){
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
      log('New setId', setId, 'for set "'+label+'"');

      const set = {
        label: label,
        states: {},
        none: true,
        all: true,
        active: 0,
        separator: defaultSeparator
      };

      sets[setId] = set;
      setLabels[label] = setId;

      log('set', setId, '=', sets[setId]);
      log('=======================');

      // create the Tokens for this new set
      var tokenName = flowTokenPrefix+flowTokenActive+setId;
      var tokenOptions = {
        type: 'string',
        title: ''+set.label+labelPostfixActive
      };
      var tokenValue = listStates(setId, set.states, true);
      updateToken(tokenName, tokenOptions, tokenValue);
  
      tokenName = flowTokenPrefix+flowTokenInactive+setId;
      tokenOptions = {
        type: 'string',
        title: ''+set.label+labelPostfixInactive
      };
      tokenValue = listStates(setId, set.states, false);
      updateToken(tokenName, tokenOptions, tokenValue);

      // Update the FlowTokens (count active states)
      var tokenName = flowTokenPrefix+flowTokenActive+flowTokenCount+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelPostfixActive+labelCount
      };
      var tokenValue = countActive(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);

      // Update the FlowTokens (count inactive states)
      var tokenName = flowTokenPrefix+flowTokenInactive+flowTokenCount+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelPostfixInactive+labelCount
      };
      var tokenValue = getObjectSize(set.states) - countActive(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);

      // Update the FlowTokens (total number of states)
      var tokenName = flowTokenPrefix+flowTokenTotal+setId;
      var tokenOptions = {
        type: 'number',
        title: ''+set.label+labelTotal
      };
      var tokenValue = getObjectSize(set.states);
      updateToken(tokenName, tokenOptions, tokenValue);
      
      log('=======================');

      updateSettings('sets', sets);
      updateSettings('setLabels', setLabels);
      await updateApi('sets_changed', {[setId]: getSetState(setId, set)});
    }

    return setId;
  }

  // noinspection JSMethodCanBeStatic
  async deleteSet(setId){
    setId = ""+setId;

    let sets = getSettings('sets') || {};
    let set = sets[setId];

    if (set) {
      log('=======================');
      if (set.states && !isEmptyObject(set.states)) {
        log('Delete setId', setId, 'failed: not empty');
        return false;
      }
      // unregister the list Active and list Inactive tokens
      log('Cleaning all tokens in set:', setId);
      cleanupSetsAllTokens(setId);

      delete sets[setId];

      updateSettings('sets', sets);
      log('Deleted setId:', setId);

      let setLabels = getSettings('setLabels') || {};
      delete setLabels[set.label];
      updateSettings('setLabels', setLabels);

      const timers = getSettings('timers') || {};
      if (timers.hasOwnProperty(setId)) {
        delete timers[setId];
        log('timers', setId, 'deleted');
        updateSettings('timers', timers);
      }

      await updateApi('sets_changed', {[setId]: null});
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

    let stateLabels = getSettings('stateLabels') || {};
    let states = getSettings('states') || {};

    if (!stateId){
      stateId = stateLabels[label] || getUUID();
    }
    if (!stateLabels[label]) {
      stateLabels[label] = stateId;
      updateSettings('stateLabels', stateLabels);
    }
    if (!states[stateId]){
      states[stateId] = {
        label: label,
        use: 0,
      };
      updateSettings('states', states);
      await updateApi('states_changed', {[stateId]: label});
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
  getTimeout(setId, stateId){
    // Get timeout for state
    const allTimers = getSettings('timers') || {};
    const setTimers = allTimers[""+setId] || {};
    return setTimers[""+stateId] || 0;
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  getSetLabel(setId){
    return getProperty(""+setId, 'label');
  }

  // noinspection JSMethodCanBeStatic, JSUnusedGlobalSymbols
  getStateLabel(stateId){
    stateId = ""+stateId;

    const states = getSettings('states');
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

    log('getFullState => sets:',sets)

    return {states, sets, timers}
  }

   // noinspection JSMethodCanBeStatic
   updateSeparator(setId, separatorId){
    // Add a state to a set
    return updateSeparator(""+setId, ""+separatorId);
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

    let sets = getSettings('sets') || {};
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

    const state = await getState(setId, stateId);
    if (delay <= 0 || state){
      await updateSet(setId, stateId, true);
    }
    else {
      await setDelay(setId, stateId, delay);
    }
  }

  // noinspection JSMethodCanBeStatic
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
  }

  // noinspection JSMethodCanBeStatic
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
}

// noinspection JSUnresolvedVariable
module.exports = SetsApp;
