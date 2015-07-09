# angular-halresource — HAL client for AngularJS applications

A HAL client for AngularJS applications.

Usage documentation of the module is currently scarce, but the source is
documented and tested and should be easy to follow. Improving the docs is on
the roadmap.

For more information on HAL, [see here for an introduction](http://stateless.co/hal_specification.html)
or the [read the formal specification](http://tools.ietf.org/html/draft-kelly-json-hal).


## Example usage

### Getting resources

    var context, user;
    
    context = new HalContext();
    user = context.get('http://example.com/john');
    
    user.$get().then(function () {
      console.log(user.name);
    });


### Putting resources

    var context, user;
    
    context = new HalContext();
    user = context.get('http://example.com/john');
    
    user.$get().then(function () {
      user.name = 'Jane';
      return user.$putState();
    }).then(function () {
      console.log(user.name);
    });

Note that this example uses the common idiom of putting the resource state as
`application/json` instead of the full HAL representation including links.


### Following relations

    var context, user, car;
    
    context = new HalContext();
    user = context.get('http://example.com/john');
    
    user.$get().then(function () {
      car = user.$rel('car');
      return car.$get();
    }).then(function () {
      console.log(user.name);
      console.log(car.brand);
    });


### Loading resources

By using `$load` instead of `$get` a GET request will only be issued if the
resource was not already synchronized with the server. This is useful for
avoiding unnecessary GET requests for embedded resources.

In this example, if the user resource embeds the car resource, that resource
will be extracted and added to the context. No GET request will be issued to
load the car resource.

    var context, user, car;
    
    context = new HalContext();
    user = context.get('http://example.com/john');
    
    user.$load().then(function () {
      car = user.$rel('car');
      return car.$load();
    }).then(function () {
      console.log(user.name);
      console.log(car.brand);
    });


### Applying profiles

    var context, user;
    
    HalContext.registerProfile('http://example.com/profiles/user', {
      fullName: {get: function () {
        return this.firstName + ' ' + this.lastName;
      })
    });

    context = new HalContext();
    user = context.get('http://example.com/john');
    user.$applyProfile('http://example.com/profiles/user');
    
    user.firstName = 'John';
    user.lastName = 'Snow';
    console.log(user.fullName);

If the representation received from a GET request contains a profile link, it is
applied automatically.
