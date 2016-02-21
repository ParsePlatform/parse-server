var Parse = require('parse/node').Parse;

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hello world!');
});

Parse.Cloud.beforeSave('BeforeSaveFail', function(req, res) {
  res.error('You shall not pass!');
});

Parse.Cloud.beforeSave('BeforeSaveFailWithPromise', function (req, res) {
  var query = new Parse.Query('Yolo');
  query.find().then(() => {
   res.error('Nope');
  }, () => {
    res.success();
  });
});

Parse.Cloud.beforeSave('BeforeSaveUnchanged', function(req, res) {
  res.success();
});

Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
  req.object.set('foo', 'baz');
  res.success();
});

Parse.Cloud.afterSave('AfterSaveTest', function(req) {
  var obj = new Parse.Object('AfterSaveProof');
  obj.set('proof', req.object.id);
  obj.save();
});

Parse.Cloud.beforeDelete('BeforeDeleteFail', function(req, res) {
  res.error('Nope');
});

Parse.Cloud.beforeSave('BeforeDeleteFailWithPromise', function (req, res) {
  var query = new Parse.Query('Yolo');
  query.find().then(() => {
    res.error('Nope');
  }, () => {
    res.success();
  });
});

Parse.Cloud.beforeDelete('BeforeDeleteTest', function(req, res) {
  res.success();
});

Parse.Cloud.afterDelete('AfterDeleteTest', function(req) {
  var obj = new Parse.Object('AfterDeleteProof');
  obj.set('proof', req.object.id);
  obj.save();
});

Parse.Cloud.beforeSave('SaveTriggerUser', function(req, res) {
  if (req.user && req.user.id) {
    res.success();
  } else {
    res.error('No user present on request object for beforeSave.');
  }
});

Parse.Cloud.afterSave('SaveTriggerUser', function(req) {
  if (!req.user || !req.user.id) {
    console.log('No user present on request object for afterSave.');
  }
});

Parse.Cloud.define('foo', function(req, res) {
  res.success({
    object: {
      __type: 'Object',
      className: 'Foo',
      objectId: '123',
      x: 2,
      relation: {
        __type: 'Object',
        className: 'Bar',
        objectId: '234',
        x: 3
      }
    },
    array: [{
      __type: 'Object',
      className: 'Bar',
      objectId: '345',
      x: 2
    }],
    a: 2
  });
});

Parse.Cloud.define('bar', function(req, res) {
  res.error('baz');
});

Parse.Cloud.define('requiredParameterCheck', function(req, res) {
  res.success();
}, function(params) {
  return params.name;
});

Parse.Cloud.define("testRunQueriesTogether", (req, res) => {
  const obj1 = new Parse.Object("ObjectA");
  obj1.set({
    "foo": "bar"
  })
  
  const obj2 = new Parse.Object("ObjectB");
  obj2.set({
    "bar": "baz"
  });
  
  Parse.Promise.when(obj1.save(), obj2.save()).then((obj1Again, obj2Again) => {
    expect(obj1Again.get("foo")).toEqual("bar");
    expect(obj2Again.get("bar")).toEqual("baz");
    
    const q1 = new Parse.Query("ObjectA");
    const q2 = new Parse.Query("ObjectB");
    
    return Parse.Promise.when(q1.first(), q2.first())
    
  }).then((obj1Again, obj2Again) => {
    expect(obj1Again.get("foo")).toEqual("bar");
    expect(obj2Again.get("bar")).toEqual("baz");
    res.success([obj1Again, obj2Again]);
  });
});

Parse.Cloud.define("testCreateManyObjectInParallel", (req, res) => {
  var objects1 = [];
  var objects2 = [];
  // create 400 objects
  for(var i=0; i<200; i++) {
    var objA = new Parse.Object("ObjectA");
    var objB = new Parse.Object("ObjectB");
    objA.set({
      index: i
    })
    objB.set({
      index: i
    })
    objects1.push(objA);
    objects2.push(objB);
  }
  
  // Gotta save dem all
  var promises = [];
  promises.push(Parse.Object.saveAll(objects1));
  promises.push(Parse.Object.saveAll(objects2));
  return Parse.Promise.when(promises).then(function(res){
    if (res.length != 2) {
      throw "Should have two results"
    }
    if (res[0].length != 200) {
      throw "Should have saved 200 object on the 1st class"
    }
    if (res[1].length != 200) {
      throw "Should have saved 200 object on the 2nd class"
    }
    var qA = new Parse.Query("ObjectA");
    var qB = new Parse.Query("ObjectB");
    qA.limit(1000);
    qB.limit(1000);
    var promises = [];
    promises.push(qA.find());
    promises.push(qB.find());
    return Parse.Promise.when(promises);  
  }).then(function(results){
    res.success(results);
  })
  
})
