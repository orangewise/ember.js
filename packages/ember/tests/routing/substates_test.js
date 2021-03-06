var Router, App, AppView, templates, router, container, counter;
var get = Ember.get, set = Ember.set, compile = Ember.Handlebars.compile;

function step(expectedValue, description) {
  equal(counter, expectedValue, "Step " + expectedValue + ": " + description);
  counter++;
}

function bootApplication(startingURL) {

  for (var name in templates) {
    Ember.TEMPLATES[name] = compile(templates[name]);
  }

  if (startingURL) {
    Ember.NoneLocation.reopen({
      path: startingURL
    });
  }

  startingURL = startingURL || '';
  router = container.lookup('router:main');
  Ember.run(App, 'advanceReadiness');
}

function handleURL(path) {
  return Ember.run(function() {
    return router.handleURL(path).then(function(value) {
      ok(true, 'url: `' + path + '` was handled');
      return value;
    }, function(reason) {
      ok(false, 'failed to visit:`' + path + '` reason: `' + QUnit.jsDump.parse(reason));
      throw reason;
    });
  });
}

if (Ember.FEATURES.isEnabled("ember-routing-loading-error-substates")) {

  module("Loading/Error Substates", {
    setup: function() {
      counter = 1;

      Ember.run(function() {
        App = Ember.Application.create({
          name: "App",
          rootElement: '#qunit-fixture'
        });

        App.deferReadiness();

        App.Router.reopen({
          location: 'none'
        });

        Router = App.Router;

        container = App.__container__;

        templates = {
          application: '<div id="app">{{outlet}}</div>',
          index: 'INDEX',
          loading: 'LOADING',
          bro: 'BRO',
          sis: 'SIS'
        };
      });
    },

    teardown: function() {
      Ember.run(function() {
        App.destroy();
        App = null;

        Ember.TEMPLATES = {};
      });

      Ember.NoneLocation.reopen({
        path: ''
      });
    }
  });

  test("Slow promise from a child route of application enters nested loading state", function() {

    var broModel = {}, broDeferred = Ember.RSVP.defer();

    Router.map(function() {
      this.route('bro');
    });

    App.ApplicationRoute = Ember.Route.extend({
      setupController: function() {
        step(2, "ApplicationRoute#setup");
      }
    });

    App.BroRoute = Ember.Route.extend({
      model: function() {
        step(1, "BroRoute#model");
        return broDeferred.promise;
      }
    });

    bootApplication('/bro');

    equal(Ember.$('#app', '#qunit-fixture').text(), "LOADING", "The Loading template is nested in application template's outlet");

    Ember.run(broDeferred, 'resolve', broModel);

    equal(Ember.$('#app', '#qunit-fixture').text(), "BRO", "bro template has loaded and replaced loading template");
  });

  test("Slow promises waterfall on startup", function() {

    expect(7);

    var grandmaDeferred = Ember.RSVP.defer(),
        sallyDeferred = Ember.RSVP.defer();

    Router.map(function() {
      this.resource('grandma', function() {
        this.resource('mom', function() {
          this.route('sally');
        });
      });
    });

    templates.grandma = "GRANDMA {{outlet}}";
    templates.mom = "MOM {{outlet}}";
    templates['mom/loading'] = "MOMLOADING";
    templates['mom/sally'] = "SALLY";

    App.GrandmaRoute = Ember.Route.extend({
      model: function() {
        step(1, "GrandmaRoute#model");
        return grandmaDeferred.promise;
      }
    });

    App.MomRoute = Ember.Route.extend({
      model: function() {
        step(2, "Mom#model");
        return {};
      }
    });

    App.MomSallyRoute = Ember.Route.extend({
      model: function() {
        step(3, "SallyRoute#model");
        return sallyDeferred.promise;
      },
      setupController: function() {
        step(4, "SallyRoute#setupController");
      }
    });

    bootApplication('/grandma/mom/sally');

    equal(Ember.$('#app', '#qunit-fixture').text(), "LOADING", "The Loading template is nested in application template's outlet");

    Ember.run(grandmaDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "GRANDMA MOM MOMLOADING", "Mom's child loading route is displayed due to sally's slow promise");

    Ember.run(sallyDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "GRANDMA MOM SALLY", "Sally template displayed");
  });

  test("ApplicationRoute#currentPath reflects loading state path", function() {

    expect(4);

    var momDeferred = Ember.RSVP.defer();

    Router.map(function() {
      this.resource('grandma', function() {
        this.route('mom');
      });
    });

    templates.grandma = "GRANDMA {{outlet}}";
    templates['grandma/loading'] = "GRANDMALOADING";
    templates['grandma/mom'] = "MOM";

    App.GrandmaMomRoute = Ember.Route.extend({
      model: function() {
        return momDeferred.promise;
      }
    });

    bootApplication('/grandma/mom');

    equal(Ember.$('#app', '#qunit-fixture').text(), "GRANDMA GRANDMALOADING");

    var appController = container.lookup('controller:application');
    equal(appController.get('currentPath'), "grandma.loading", "currentPath reflects loading state");

    Ember.run(momDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "GRANDMA MOM");
    equal(appController.get('currentPath'), "grandma.mom", "currentPath reflects final state");
  });

  test("Slow promises returned from ApplicationRoute#model don't enter a substate", function() {

    expect(2);

    var appDeferred = Ember.RSVP.defer();

    App.ApplicationRoute = Ember.Route.extend({
      model: function() {
        return appDeferred.promise;
      }
    });

    App.LoadingRoute = Ember.Route.extend({
      setupController: function() {
        ok(false, "shouldn't get here");
      }
    });

    bootApplication();

    equal(Ember.$('#app', '#qunit-fixture').text(), "", "nothing has been rendered yet");

    Ember.run(appDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "INDEX");
  });

  test("Don't enter loading route unless either route or template defined", function() {

    delete templates.loading;

    expect(2);

    var indexDeferred = Ember.RSVP.defer();

    App.ApplicationController = Ember.Controller.extend();

    App.IndexRoute = Ember.Route.extend({
      model: function() {
        return indexDeferred.promise;
      }
    });

    bootApplication();

    var appController = container.lookup('controller:application');
    ok(appController.get('currentPath') !== "loading", "loading state not entered");

    Ember.run(indexDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "INDEX");
  });

  test("Enter loading route if only LoadingRoute defined", function() {

    delete templates.loading;

    expect(4);

    var indexDeferred = Ember.RSVP.defer();

    App.IndexRoute = Ember.Route.extend({
      model: function() {
        step(1, "IndexRoute#model");
        return indexDeferred.promise;
      }
    });

    App.LoadingRoute = Ember.Route.extend({
      setupController: function() {
        step(2, "LoadingRoute#setupController");
      }
    });

    bootApplication();

    var appController = container.lookup('controller:application');
    equal(appController.get('currentPath'), "loading", "loading state entered");

    Ember.run(indexDeferred, 'resolve', {});
    equal(Ember.$('#app', '#qunit-fixture').text(), "INDEX");
  });

  test("Enter child loading state of pivot route", function() {

    expect(4);

    var deferred = Ember.RSVP.defer();

    Router.map(function() {
      this.resource('grandma', function() {
        this.resource('mom', function() {
          this.route('sally');
        });
        this.route('smells');
      });
    });

    templates['grandma/loading'] = "GMONEYLOADING";

    App.ApplicationController = Ember.Controller.extend();

    App.MomSallyRoute = Ember.Route.extend({
      setupController: function() {
        step(1, "SallyRoute#setupController");
      }
    });

    App.GrandmaSmellsRoute = Ember.Route.extend({
      model: function() {
        return deferred.promise;
      }
    });

    bootApplication('/grandma/mom/sally');

    var appController = container.lookup('controller:application');
    equal(appController.get('currentPath'), "grandma.mom.sally", "Initial route fully loaded");

    Ember.run(router, 'transitionTo', 'grandma.smells');
    equal(appController.get('currentPath'), "grandma.loading", "in pivot route's child loading state");

    Ember.run(deferred, 'resolve', {});

    equal(appController.get('currentPath'), "grandma.smells", "Finished transition");
  });

  test("Don't bubble loading event above pivot route", function() {

    expect(5);

    delete templates.loading;

    var sallyDeferred = Ember.RSVP.defer(),
        smellsDeferred = Ember.RSVP.defer();

    var shouldBubbleToApplication = true;

    Router.map(function() {
      this.resource('grandma', function() {
        this.resource('mom', function() {
          this.route('sally');
        });
        this.route('smells');
      });
    });

    App.ApplicationController = Ember.Controller.extend();

    App.ApplicationRoute = Ember.Route.extend({
      actions: {
        loading: function(transition, route) {
          equal(route, container.lookup('route:mom.sally'), "the only route whose loading event should bubble to app route is mom.sally");
        }
      }
    });

    App.MomSallyRoute = Ember.Route.extend({
      model: function() {
        return sallyDeferred.promise;
      }
    });

    App.GrandmaSmellsRoute = Ember.Route.extend({
      model: function() {
        return smellsDeferred.promise;
      }
    });

    bootApplication('/grandma/mom/sally');

    var appController = container.lookup('controller:application');
    ok(!appController.get('currentPath'), "Initial route fully loaded");
    Ember.run(sallyDeferred, 'resolve', {});

    equal(appController.get('currentPath'), "grandma.mom.sally", "transition completed");

    Ember.run(router, 'transitionTo', 'grandma.smells');
    equal(appController.get('currentPath'), "grandma.mom.sally", "still in initial state because loading event didn't bubble");

    Ember.run(smellsDeferred, 'resolve', {});

    equal(appController.get('currentPath'), "grandma.smells", "Finished transition");
  });

  test("Default error event moves into nested route", function() {

    expect(5);

    templates['grandma'] = "GRANDMA {{outlet}}";
    templates['grandma/error'] = "ERROR: {{msg}}";

    Router.map(function() {
      this.resource('grandma', function() {
        this.resource('mom', function() {
          this.route('sally');
        });
      });
    });

    App.ApplicationController = Ember.Controller.extend();

    App.MomSallyRoute = Ember.Route.extend({
      model: function() {
        step(1, "MomSallyRoute#model");
        throw {
          msg: "did it broke?"
        };
      },
      actions: {
        error: function() {
          step(2, "MomSallyRoute#actions.error");
          return true;
        }
      }
    });

    bootApplication('/grandma/mom/sally');

    step(3, "App finished booting");

    equal(Ember.$('#app', '#qunit-fixture').text(), "GRANDMA ERROR: did it broke?", "error bubbles");

    var appController = container.lookup('controller:application');
    equal(appController.get('currentPath'), 'grandma.error', "Initial route fully loaded");
  });
}
