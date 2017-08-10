"use strict";

const Homey = require('homey');

function log(){
  if (Homey.env.DEBUG){
    console.log.apply(console, arguments);
  }
}

function matchCondition(name, matchFn){
  return async (args) => {
    const result = await matchFn(args);
    log(`matchCondition "${name}":`, args, '=>', result);
    return result;
  }
}

function executeAction(name, actionFn){
  return async (args) => {
    const result = await actionFn(args);
    log(`executeAction "${name}":`, args, '=>', result);
    return result;
  }
}

async function getSetId(args){
  return args.set && await Homey.app.getSetId(args.set.name, args.set.id);
}

async function getStateId(args){
  return args.state && await Homey.app.getStateId(args.state.name, args.state.id);
}

//noinspection JSUnresolvedVariable
const autoCompleteListener = {
  set: async (query) => await Homey.app.autoCompleteSet(query),
  state: async (query, args) => await Homey.app.autoCompleteState(await getSetId(args), query)
};

function matchTrigger(name){
  return async (args, state) => {
    const setId = await getSetId(args);
    const stateId = await getStateId(args);
    setId && stateId && await Homey.app.addState(setId, stateId);

    let result = setId === state.setId;

    if (result && stateId && state.stateId){
      result = stateId === state.stateId;
    }

    if (result && state.trigger){
      result = args.trigger === state.trigger;
    }

    log(`matchTrigger "${name}":`, args,'==', state, '=>', result);
    return result;
  }
}

function registerAutocomplete(flowcard, args){
  args.forEach((arg) => {
    flowcard.getArgument(arg).registerAutocompleteListener(autoCompleteListener[arg]);
  })
}


//noinspection JSUnresolvedVariable
module.exports = function initFlows() {
  // Triggers;
  let triggers = {};

  function registerTrigger(name, args){
    const trigger = triggers[name] = new Homey.FlowCardTrigger(name);
    trigger.register().registerRunListener(matchTrigger(name));
    registerAutocomplete(trigger, args);
  }

  registerTrigger('none_active', ['set']);
  registerTrigger('not_none_active', ['set']);
  registerTrigger('none_active_changed', ['set']);
  registerTrigger('all_active', ['set']);
  registerTrigger('not_all_active', ['set']);
  registerTrigger('all_active_changed', ['set']);
  registerTrigger('state_set', ['set', 'state']);
  registerTrigger('state_reset', ['set', 'state']);
  registerTrigger('change', ['set']);

  // Conditions
  function registerCondition(name, args, fn){
    const trigger =  new Homey.FlowCardCondition(name);
    trigger.register().registerRunListener(matchCondition(name, fn));
    registerAutocomplete(trigger, args);
  }

  registerCondition('none_active', ['set'],
    async (args) => await Homey.app.getNone(await getSetId(args))
  );
  registerCondition('all_active', ['set'],
    async (args) => await Homey.app.getAll(await getSetId(args))
  );
  registerCondition('is_active', ['set', 'state'],
    async (args) => await Homey.app.getState(await getSetId(args), await getStateId(args))
  );

  // Actions

  function registerAction(name, args, fn){
    const action = new Homey.FlowCardAction(name);
    action.register().registerRunListener(executeAction(name, fn));
    registerAutocomplete(action, args);
  }

  registerAction('activate_state', ['set', 'state'],
    async (args) => await Homey.app.setState(await getSetId(args), await getStateId(args), true)
  );
  registerAction('activate_temp_state', ['set', 'state'],
    async args => await Homey.app.setState(await getSetId(args), await getStateId(args), args.timeout)
  );
  registerAction('activate_delayed', ['set', 'state'],
    async args => await Homey.app.setDelayed(await getSetId(args), await getStateId(args), args.delay)
  );
  registerAction('deactivate_state', ['set', 'state'],
    async args => await Homey.app.setState(await getSetId(args), await getStateId(args), false)
  );
  registerAction('activate_all', ['set'],
    async args => await Homey.app.setAll(await getSetId(args), true)
  );
  registerAction('deactivate_all', ['set'],
    async args => await Homey.app.setAll(await getSetId(args), false)
  );
  registerAction('activate_one', ['set', 'state'],
    async args => await Homey.app.setExactlyOne(await getSetId(args), await getStateId(args))
  );

  log('flow initialized');

  return triggers;
};
