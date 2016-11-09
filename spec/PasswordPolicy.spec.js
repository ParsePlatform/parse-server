"use strict";

const request = require('request');
const Config = require('../src/Config');

describe("Password Token Expiry: ", () => {

  it('should show the invalid link page if the user clicks on the password reset link after the token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions = options;
      },
      sendMail: () => {
      }
    }
    reconfigureServer({
      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      passwordPolicy: {
        resetTokenValidityDuration: 0.5, // 0.5 second
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("testResetTokenValidity");
      user.setPassword("original");
      user.set('email', 'user@parse.com');
      return user.signUp();
    })
      .then(user => {
        Parse.User.requestPasswordReset("user@parse.com");
      })
      .then(() => {
        // wait for a bit more than the validity duration set
        setTimeout(() => {
          expect(sendEmailOptions).not.toBeUndefined();

          request.get(sendEmailOptions.link, {
            followRedirect: false,
          }, (error, response, body) => {
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/invalid_link.html');
            done();
          });
        }, 1000);
      }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should show the reset password page if the user clicks on the password reset link before the token expires', done => {
    const user = new Parse.User();
    let sendEmailOptions;
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        sendEmailOptions = options;
      },
      sendMail: () => {
      }
    }
    reconfigureServer({
      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      passwordPolicy: {
        resetTokenValidityDuration: 5, // 5 seconds
      },
      publicServerURL: "http://localhost:8378/1"
    })
      .then(() => {
        user.setUsername("testResetTokenValidity");
        user.setPassword("original");
        user.set('email', 'user@parse.com');
        return user.signUp();
      })
      .then(user => {
        Parse.User.requestPasswordReset("user@parse.com");
      })
      .then(() => {
        // wait for a bit but less than the validity duration
        setTimeout(() => {
          expect(sendEmailOptions).not.toBeUndefined();

          request.get(sendEmailOptions.link, {
            followRedirect: false,
          }, (error, response, body) => {
            expect(response.statusCode).toEqual(302);
            const re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=[a-zA-Z0-9]+\&id=test\&username=testResetTokenValidity/;
            expect(response.body.match(re)).not.toBe(null);
            done();
          });
        }, 1000);
      }).catch((err) => {
      jfail(err);
      done();
    });
  });

  it('should fail if resetTokenValidityDuration is not a number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        resetTokenValidityDuration: "not a number"
      },
      publicServerURL: "http://localhost:8378/1"
    })
      .then(() => {
        fail('passwordPolicy.resetTokenValidityDuration "not a number" test failed');
        done();
      })
      .catch(err => {
        expect(err).toEqual('passwordPolicy.resetTokenValidityDuration must be a positive number');
        done();
      });
  });

  it('should fail if resetTokenValidityDuration is zero or a negative number', done => {
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        resetTokenValidityDuration: 0
      },
      publicServerURL: "http://localhost:8378/1"
    })
      .then(() => {
        fail('resetTokenValidityDuration negative number test failed');
        done();
      })
      .catch(err => {
        expect(err).toEqual('passwordPolicy.resetTokenValidityDuration must be a positive number');
        done();
      });
  });

  it('signup should fail if password does not confirm to the policy enforced using RegExp', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("nodigit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not confirm to the policy.');
        done();
      }, (error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password confirms to the policy enforced using RegExp', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("1digit");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        done();
      }, (error) => {
        fail('Should have succeeded as password confirms to the policy.');
        done();
      });
    })
  });

  it('signup should fail if password does not confirm to the policy enforced using regex string', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: "[A-Z]+"  // password should contain at least one UPPER case letter
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("all lower");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not confirm to the policy.');
        done();
      }, (error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password confirms to the policy enforced using regex string', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: /[A-Z]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("oneUpper");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        done();
      }, (error) => {
        fail('Should have succeeded as password confirms to the policy.');
        done();
      });
    })
  });

  it('signup should fail if password does not confirm to the policy enforced using a callback function', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: password => false  // just fail
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("any");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        fail('Should have failed as password does not confirm to the policy.');
        done();
      }, (error) => {
        expect(error.code).toEqual(142);
        done();
      });
    })
  });

  it('signup should succeed if password confirms to the policy enforced using a callback function', (done) => {
    const user = new Parse.User();
    reconfigureServer({
      appName: 'passwordPolicy',
      passwordPolicy: {
        validator: password => true   // never fail
      },
      publicServerURL: "http://localhost:8378/1"
    }).then(() => {
      user.setUsername("user1");
      user.setPassword("oneUpper");
      user.set('email', 'user1@parse.com');
      user.signUp().then(() => {
        done();
      }, (error) => {
        fail('Should have succeeded as password confirms to the policy.');
        done();
      });
    })
  });

  it('should reset password if new password confirms to password policy', done => {
    var user = new Parse.User();
    var emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        request.get(options.link, {
          followRedirect: false,
        }, (error, response, body) => {
          if (error) {
            jfail(error);
            fail("Failed to get the reset link");
            return;
          }
          expect(response.statusCode).toEqual(302);
          var re = /http:\/\/localhost:8378\/1\/apps\/choose_password\?token=([a-zA-Z0-9]+)\&id=test\&username=user1/;
          var match = response.body.match(re);
          if (!match) {
            fail("should have a token");
            done();
            return;
          }
          var token = match[1];

          request.post({
            url: "http://localhost:8378/1/apps/test/request_password_reset",
            body: `new_password=has2init&token=${token}&username=user1`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            followRedirect: false,
          }, (error, response, body) => {
            if (error) {
              jfail(error);
              fail("Failed to POST request password reset");
              return;
            }
            expect(response.statusCode).toEqual(302);
            expect(response.body).toEqual('Found. Redirecting to http://localhost:8378/1/apps/password_reset_success.html');

            Parse.User.logIn("user1", "has2init").then(function (user) {
              done();
            }, (err) => {
              jfail(err);
              fail("should login with new password");
              done();
            });

          });
        });
      },
      sendMail: () => {
      }
    }
    reconfigureServer({
      appName: 'passwordPolicy',
      verifyUserEmails: false,
      emailAdapter: emailAdapter,
      passwordPolicy: {
        validator: /[0-9]+/  // password should contain at least one digit
      },
      publicServerURL: "http://localhost:8378/1"
    })
      .then(() => {
        user.setUsername("user1");
        user.setPassword("has 1 digit");
        user.set('email', 'user1@parse.com');
        user.signUp().then(() => {
          Parse.User.requestPasswordReset('user1@parse.com', {
            error: (err) => {
              jfail(err);
              fail("Reset password request should not fail");
              done();
            }
          });
        }, error => {
          jfail(err);
          fail("signUp should not fail");
          done();
        });
      });
  });

})
