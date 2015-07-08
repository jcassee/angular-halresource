# angular-halresource — HAL client for AngularJS applications

A HAL client for AngularJS applications.

Usage documentation of the module is currently scarce, but the source is
documented and tested and should be easy to follow. Improving the docs is on
the roadmap.

Also on the roadmap is a system to add functions to a resource based on its
profile, but that feature is not finished yet.


## Example usage

Loading resources:

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

Changing resources:

    var context, user;
    context = new HalContext();
    user = context.get('http://example.com/john');
    user.$load().then(function () {
      user.name = 'Jane';
      return user.$putState();
    }).then(function () {
      console.log(user.name);
    });
