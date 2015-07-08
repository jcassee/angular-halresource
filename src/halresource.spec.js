'use strict';

describe('HalContext', function () {
  beforeEach(module('halresource'));


  // Injection

  var HalContext;

  beforeEach(inject(function (_HalContext_) {
    HalContext = _HalContext_;
  }));


  // Setup

  var context;

  beforeEach(function () {
    context = new HalContext();
  });


  // Tests

  it('creates unique resources', function () {
    var resource1a = context.get('http://example.com/1');
    var resource1b = context.get('http://example.com/1');
    var resource2 = context.get('http://example.com/2');
    expect(resource1a).toBe(resource1b);
    expect(resource1a).not.toBe(resource2);
  });
});


describe('HalResource', function () {
  beforeEach(module('halresource'));


  // Injection

  var $httpBackend, $log, $rootScope, HalContext;

  beforeEach(inject(function (_$httpBackend_, _$log_, _$rootScope_, _HalContext_) {
    $httpBackend = _$httpBackend_;
    $log = _$log_;
    $rootScope = _$rootScope_;
    HalContext = _HalContext_;
  }));


  // Setup

  var context, uri, resource;

  beforeEach(function () {
    uri = 'http://example.com';
    context = new HalContext();
    resource = context.get(uri);
  });

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });


  // Tests

  it('has a self href', function () {
    expect(resource._links.self.href).toBe(uri);
  });

  it('has a uri', function () {
    expect(resource.$uri).toBe(uri);
  });

  it('has a context', function () {
    expect(resource.$context).toBe(context);
  });

  it('has a profile', function () {
    var profile = 'http://example.com/profile';
    resource._links.profile = {href: profile};
    expect(resource.$profile).toBe(profile);
  });

  it('has state', function () {
    resource.name = 'John Doe';
    resource._embedded = {example: {_links: {self: {href: 'http://example.com/2'}}}};
    expect(resource.$toState()).toEqual({name: 'John Doe'});
  });

  it('resolves links', function () {
    var href = 'http://example.com/1';
    resource._links.example = {href: href};
    expect(resource.$href('example')).toBe(href);
  });

  it('resolves templated links', function () {
    resource._links.example = {href: 'http://example.com/{id}', templated: true};
    expect(resource.$href('example', {id: '1'})).toBe('http://example.com/1');
  });

  it('warns when resolving templated links without vars', function () {
    resource._links.example = {href: 'http://example.com/{id}', templated: true};
    resource.$href('example');
    expect($log.warn.logs).toEqual([["Following templated link relation 'example' without variables"]]);
  });

  it('warns when resolving a deprecated link', function () {
    resource._links.example = {href: 'http://example.com/1', deprecation: 'http://example.com/deprecation'};
    resource.$href('example');
    expect($log.warn.logs).toEqual([["Following deprecated link relation 'example': http://example.com/deprecation"]]);
  });

  it('resolves array links', function () {
    var resource1 = context.get('http://example.com/1');
    var href1 = 'http://example.com/1';
    var href2 = 'http://example.com/2';
    resource1._links.example = [{href: href1}, {href: href2}];
    expect(resource1.$href('example')).toEqual([href1, href2]);
  });

  it('follows links', function () {
    var resource1 = context.get('http://example.com/1');
    resource._links.example = {href: resource1.$uri};
    expect(resource.$rel('example')).toBe(resource1);
  });

  it('follows array links', function () {
    var resource1 = context.get('http://example.com/1');
    var resource2 = context.get('http://example.com/2');
    resource._links.example = [{href: resource1.$uri}, {href: resource2.$uri}];
    expect(resource.$rel('example')).toEqual([resource1, resource2]);
  });

  it('starts out unsynced', function () {
    expect(resource.$syncTime).toBeNull();
  });

  it('performs HTTP GET requests', function () {
    resource.$get();
    $httpBackend.expectGET(uri, {'Accept': 'application/hal+json'})
        .respond({name: 'John Doe', _links: {self: {href: uri}}}, {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(resource.name).toBe('John Doe');
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('performs HTTP PUT requests', function () {
    resource.$put();
    $httpBackend.expectPUT(uri, {"_links":{"self":{"href":"http://example.com"}}},
          {'Accept': 'application/hal+json', 'Content-Type': 'application/hal+json'})
        .respond(204);
    $httpBackend.flush();
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('performs HTTP PUT requests with HAL response', function () {
    resource.$put();
    $httpBackend.expectPUT(uri, {"_links":{"self":{"href":"http://example.com"}}},
          {'Accept': 'application/hal+json', 'Content-Type': 'application/hal+json'})
        .respond({name: 'John Doe', _links: {self: {href: uri}}}, {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(resource.name).toBe('John Doe');
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('performs state HTTP PUT requests', function () {
    resource.$putState();
    $httpBackend.expectPUT(uri, {},
          {'Accept': 'application/hal+json', 'Content-Type': 'application/json'})
        .respond(204);
    $httpBackend.flush();
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('performs HTTP PUT requests with HAL response', function () {
    resource.$putState();
    $httpBackend.expectPUT(uri, {},
          {'Accept': 'application/hal+json', 'Content-Type': 'application/json'})
        .respond({name: 'John Doe', _links: {self: {href: uri}}}, {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(resource.name).toBe('John Doe');
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('performs HTTP DELETE requests', function () {
    resource.$syncTime = 1;
    resource.$delete();
    $httpBackend.expectDELETE(uri).respond(204);
    $httpBackend.flush();
    expect(resource.$syncTime).toBeNull();
  });

  it('performs HTTP POST requests', function () {
    resource.$syncTime = 1;
    resource.$post('Test', {'Accept': '*/*', 'Content-Type': 'text/plain'});
    $httpBackend.expectPOST(uri, 'Test', {'Accept': '*/*', 'Content-Type': 'text/plain'}).respond(204);
    $httpBackend.flush();
    expect(resource.$syncTime).toBe(1);
  });

  it('performs HTTP POST requests without headers', function () {
    resource.$syncTime = 1;
    resource.$post('Test');
    $httpBackend.expectPOST(uri, 'Test').respond(204);
    $httpBackend.flush();
    expect(resource.$syncTime).toBe(1);
  });

  it('performs a HTTP GET on load if not yet synced', function () {
    resource.$load();
    $httpBackend.expectGET(uri, {'Accept': 'application/hal+json'})
      .respond({name: 'John Doe', _links: {self: {href: uri}}}, {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(resource.name).toBe('John Doe');
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('returns a resolved promise on load if already synced', function () {
    var resolved = false;
    resource.$syncTime = 1;
    resource.$load().then(function () { resolved = true; });
    $rootScope.$digest();
    expect(resolved).toBe(true);
  });

  it('adds embedded resources from HTTP to the context', function () {
    var carResource = context.get('http://example.com/car');
    resource.$get();
    $httpBackend.expectGET(uri, {'Accept': 'application/hal+json'})
      .respond({
        name: 'John Doe',
        _links: {
          self: {href: uri}
        },
        _embedded: {
          hat: {
            style: 'Fedora',
            _links: {
              self: {href: 'http://example.com/hat'}
            }
          },
          car: {
            brand: 'Porsche',
            type: '911',
            _links: {
              self: {href: 'http://example.com/car'}
            },
            _embedded: {
              engine: {
                type: '901/01 flat-6',
                _links: {
                  self: {href: 'http://example.com/engine'}
                }
              }
            }
          }
        }
      }, {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(resource.name).toBe('John Doe');
    expect(resource.$rel('hat')).toBe(context.get('http://example.com/hat'));
    expect(resource.$rel('car')).toBe(carResource);
    expect(carResource.brand).toBe('Porsche');
    expect(carResource.$rel('engine')).toBe(context.get('http://example.com/engine'));
    expect(resource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
    expect(carResource.$syncTime / 10).toBeCloseTo(Date.now() / 10, 0);
  });

  it('reject a HTTP request if the self link in the response is different', function () {
    var error = null;
    resource.$get().catch(function (e) { error = e; });
    $httpBackend.expectGET(uri, {'Accept': 'application/hal+json'})
      .respond({name: 'John Doe', _links: {self: {href: 'http://example.com/other'}}},
        {'Content-Type': 'application/hal+json'});
    $httpBackend.flush();
    expect(error).toBe("Self link href differs: expected 'http://example.com', was 'http://example.com/other'");
    expect(resource.name).toBeUndefined();
  });
});
