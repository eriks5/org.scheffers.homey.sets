# State sets for Homey

## About

This Homey App allows you to combine multiple inputs, or states, into sets and act upon changes of the states 
in those sets.

For example, this can be used to combine multiple motion sensors located in a single room into a set and turn on 
lights in that room when at least one of the motion sensors is triggered, and turn of the lights after no motion
has been observed for a while.

Using the settings page, sets and states are created. After that, these sets and states are available to be used
in flows. 

The following flow actions are available:
 
 * Activate or deactivate a state in a set without changing the other states,
 * Activate one state in a set and deactivate the others, or
 * Activate a state in a set temporarily, or
 * Activate a state in a set after a delay, or
 * Activate or deactivate all states in a set.
 
The following triggers are available to trigger flows:

 * A specific state is activated or deactivated, or
 * The set changes from having no states active to having one or more states active, or
 * The set changes from having all states active to having one or more states inactive, or
 * Trigger on any change in a set (useful in combination with conditions)
  
The following conditions are available:

 * No states of a set are active, or 
 * All states of a set are active, or
 * A specific state of a set is active
 
## Changelog

v0.2.0: Added **Activate exactly one** and **Activate state delayed** actions

v0.1.1: Auto-restore feature added: sets and states will be re-created using info in flows.

v0.0.1: Initial release

## Settings
 
The settings page allows you to create and remove sets, and add and remove states from these sets. Before removing
states and sets, make sure no flows use them anymore, otherwise they will be recreated as soon as a flow uses them.

The settings also show the current state of the sets. States with a white background are not active, states 
with a green background are active, while states with a blue background are active temporarily and will
be deactivated when the timer listed after the state reaches 0.

States can also be changed directly from the settings page, this is useful for debugging flows. 
Clicking a state will toggle it between the active and inactive states.

### Auto restore feature

When a flow accesses a set or state that is not configured, the set or state will be created. This is useful for when
the settings of this app have been lost, but the flows still exist.
 
## Flows

The following cards are available to be used in flows:

### Action cards

**Activate state**

Arguments: set, state

Activate *state* in *set*.

**Activate state temporarily**

Arguments: set, state, timeout

Activate *state* in *set* for *timeout* seconds, then deactivate it.

If the state gets updated (either activated or deactivated) by another action before the timer ends,
the timeout is cancelled.

**Activate state delayed**

Arguments: set, state, delay

Activate *state* in *set* after *delay* seconds if it is deactivated.

If the state gets updated (either activated or deactivated) by another action before the timer ends,
the delay is cancelled.

**Deactivate state**

Arguments: set, state

Deactivate *state* in *set*.
 
**Activate all states**

Arguments: set

Activate all states in *set*.

**Deactivate all states**

Arguments: set

Deactivate all states *set*.

**Activate exactly one**

Arguments: set, state

Activate *state* in *set* and deactivate all other states in *set*

### Trigger cards

**Some states active**

Arguments: set

Triggers the flow when no states were previously active in *set* and one or more states becomes active.

**No states active**

Arguments: set

Triggers the flow when some states were previously active in *set* and all states have become inactive.

**Change none/some states active**

Arguments: set

Triggers the flow when *set* changes between having no states active to having some states active, or vise versa.

**All states active**

Arguments: set

Triggers the flow when not all states were previously active in *set* and all states have now become active.

**Not all states active**

Arguments: set

Triggers the flow when all states were previously active in *set* and now some states are not active.

**Change all/not all states active**

Arguments: set

Triggers the flow when *set* changes between having all states active to having some states active, or vise versa

**State activated**

Arguments: set, state, trigger

Triggers the flow when *state* is activated in *set*. 

If *trigger* is set to `changed`, this will only trigger when the state was previously not active. 
If *trigger* is set to `always`, this will trigger whenever the state is activated by an action, even if it already was.

**State deactivated**

Arguments: set, state, trigger

Triggers the flow when *state* is deactivated in *set*. 

If *trigger* is set to `changed`, this will only trigger when the state was previously active. 
If *trigger* is set to `always`, this will trigger whenever the state is deactivated, even if it already was.

**Change**

Arguments: set

Triggers the flow whenever there is a change is *set*, ie. whenever a state changes from active to inactive, 
or vice versa.

### Condition cards

**No states active**

Arguments: set

Considered true when no states are active in *set*

**States active**

Arguments: set

Considered true when some or all states are active in *set*

**All states active**

Arguments: set

Considered true when all states are active in *set*

**Not all states active**

Arguments: set

Considered true when some or no states are active in *set*

**State active**

Arguments: set, state

Considered true when the given state is active in *set*

**State not active**

Arguments: set, state

Considered true when the given state is not active in *set*

## Acknowledgements

App icon and store images made with icons by [Freepik](http://www.freepik.com/) 
from [www.flaticon.com](http://www.flaticon.com/packs/math-symbols-4) 
