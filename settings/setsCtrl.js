angular.module('setsApp', []).controller('setsCtrl', ['$scope', '$rootScope', function (sc) {
  var equals = angular.equals;
  var forEach = angular.forEach;
  var hasOwnProperty = Object.hasOwnProperty;
  var Homey;

  sc._statesCache = {};

  sc.$on('ready', function(){
    Homey = window.Homey;
    Homey.on('sets_changed', handleSetsChanged);
    Homey.on('states_changed', handleStatesChanged);
    Homey.on('timers_changed', handleTimersChanged);

    readInitialState();
  });

  sc.error = function(err){
    alert(err);
  };

  function readInitialState() {
    Homey.api("GET", "/", function(err, result){
      if (err){
        return sc.error(err);
      }

      sc.$apply(function(scope){
        scope.states = result.states;
        scope.sets = result.sets;
        scope.timers = result.timers;
      });
    });
  }

  function handleSetsChanged(changes){
    // Merge changed sets
    sc.$applyAsync(function(scope){
      var sets = scope.sets, newSets = [];
      forEach(sets, function(set){
        var setId = set.id;
        if (hasOwnProperty.call(changes, setId)){
          // changes[set.id] can be null, indicating the set was deleted
          if (changes[setId]){
            newSets.push(changes[setId]);
          }
          else {
            delete scope._statesCache[setId];
          }
          delete changes[setId];
        }
        else {
          // No changes for this set
          newSets.push(set);
        }
      });
      forEach(changes, function(set){
        newSets.push(set);
      });
      scope.sets = newSets;
    });
  }

  function handleStatesChanged(changes){
    // Merge changed states
    sc.$applyAsync(function(scope){
      var states = scope.states;
      forEach(changes, function(label, stateId){
        if (label){
          states[stateId] = label;
        }
        else {
          delete states[stateId];
        }
      });
    });
  }

  function handleTimersChanged(timers){
    sc.$applyAsync(function(scope){
      scope.timers = timers;
    })
  }

  sc.getStates = function(set) {
    var states = set.states || {},
        labels = sc.states || {},
        timers = (sc.timers || {})[set.id] || {},
        result = [];

    forEach(states, function(state, stateId){
      var item = {
        id: stateId,
        label: labels[stateId]
      };

      var timer = timers[stateId];
      if (state){
        //noinspection EqualityComparisonWithCoercionJS
        if (timer != null && timer > 0){
          item.type = 'timed';
          item.timer = timer;
        }
        else {
          item.type = 'active';
        }
      }
      else {
        //noinspection EqualityComparisonWithCoercionJS
        if (timer != null && timer < 0){
          item.type = 'delayed';
          item.timer = -timer;
        }
        else {
          item.type = 'inactive';
        }
      }

      result.push(item);
    });

    var cached = sc._statesCache[set.id];
    if (cached && equals(result, cached)){
      return cached;
    }

    sc._statesCache[set.id] = result;
    return result;
  };

  sc.doShowAddSetForm = function(show){
    sc.showAddSetForm = show;
  };

  sc.enableEditSet = function(setId){
    sc.editSet = setId;
  };

  sc.createSet = function(newSet){
    Homey.api("POST", "/set", newSet, function(err){
      if (err){
        return sc.error(err);
      }
    });
    sc.showAddSetForm = false;
  };

  sc.deleteSet = function(set){
    Homey.api("DELETE", "/set/"+set.id, function(err){
      if (err){
        return sc.error(err);
      }
    })
  };

  sc.createState = function(setId, newState){
    Homey.api("POST", "/set/"+setId+"/state", newState, function(err){
      if (err){
        return sc.error(err);
      }
    });
    newState.label = '';
  };

  sc.deleteState = function(setId, stateId){
    Homey.api("DELETE", "/set/"+setId+"/state/"+stateId, function(err){
      if (err){
        return sc.error(err);
      }
    });
  };

  sc.toggleState = function(setId, stateId){
    Homey.api("PUT", "/set/"+setId+"/state/"+stateId, function(err){
      if (err){
        return sc.error(err);
      }
    });
  };

  console.log('controller loaded');
}]);
