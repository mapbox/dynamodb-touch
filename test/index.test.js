var test = require('tape');
var dynamodb = require('dynamodb-test')(test, 'dynamodb-touch', require('./table.json'));
var kinesis = require('kinesis-test')(test, 'dynamodb-touch', 1);
var touch = require('..');
var AWS = require('aws-sdk');
var crypto = require('crypto');
var Dyno = require('dyno');
var stream = require('stream');

var fixtures = [];
for (var i = 0; i < 2345; i++) {
  fixtures.push({
    id: crypto.randomBytes(8).toString('hex'),
    data: crypto.randomBytes(4500)
  });
}

dynamodb.start();
kinesis.start();
dynamodb.load(fixtures);

test('one', function(assert) {
  var clients = {
    dyno: dynamodb.dyno,
    kinesis: new AWS.Kinesis({
      region: '-',
      endpoint: 'http://localhost:7654',
      params: { StreamName: kinesis.streamName }
    })
  };

  var count = 0;
  var reader = kinesis.shards[0]()
    .on('error', function(err) {
      assert.ifError(err, 'should not error');
    })
    .on('data', function(records) {
      count += records.length;
      var data = JSON.parse((new Buffer(records[0].Data, 'base64')).toString());
      var expected = {
        eventId: '0',
        eventVersion: '1.0',
        awsRegion: 'us-east-1', // dynalite says so
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:000000000000:table/' + dynamodb.tableName + '/dynamodb-touch',
        eventSource: 'dynamodb-touch',
        eventName: 'INSERT',
        dynamodb: {
          Keys: {
            id: { S: fixtures[0].id }
          },
          NewImage: {
            id: { S: fixtures[0].id },
            data: { B: fixtures[0].data.toString('base64') }
          },
          StreamViewType: 'NEW_IMAGE',
          SequenceNumber: '0',
          SizeBytes: (new Buffer(Dyno.serialize(fixtures[0]))).length
        }
      };

      assert.deepEqual(data, expected, 'expected record written to kinesis');
      reader.close();
    })
    .on('end', function() {
      assert.equal(count, 1, 'one record written to kinesis');
      assert.end();
    });

  touch.one({ id: fixtures[0].id }, clients, function(err) {
    assert.ifError(err, 'touch.one success');
  });
});

kinesis.delete();
kinesis.start();

test('some', function(assert) {
  var clients = {
    dyno: dynamodb.dyno,
    kinesis: new AWS.Kinesis({
      region: '-',
      endpoint: 'http://localhost:7654',
      params: { StreamName: kinesis.streamName }
    })
  };

  var count = 0;
  var reader = kinesis.shards[0]()
    .on('error', function(err) {
      assert.ifError(err, 'should not error');
    })
    .on('data', function(records) {
      count += records.length;
      var data = JSON.parse((new Buffer(records[0].Data, 'base64')).toString());
      var expected = {
        eventId: '0',
        eventVersion: '1.0',
        awsRegion: 'us-east-1', // dynalite says so
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:000000000000:table/' + dynamodb.tableName + '/dynamodb-touch',
        eventSource: 'dynamodb-touch',
        eventName: 'INSERT',
        dynamodb: {
          Keys: {
            id: { S: fixtures[0].id }
          },
          NewImage: {
            id: { S: fixtures[0].id },
            data: { B: fixtures[0].data.toString('base64') }
          },
          StreamViewType: 'NEW_IMAGE',
          SequenceNumber: '0',
          SizeBytes: (new Buffer(Dyno.serialize(fixtures[0]))).length
        }
      };

      assert.deepEqual(data, expected, 'expected record written to kinesis');
      reader.close();
    })
    .on('end', function() {
      assert.equal(count, 1, 'one record written to kinesis');
      assert.end();
    });

  var query = touch.some({
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [fixtures[0].id]
      }
    }
  }, clients, function(err) {
    assert.ifError(err, 'touch.one success');
  });

  assert.ok(query instanceof stream.Readable, 'touch.some returns query stream');
});

kinesis.delete();
kinesis.start();

test('every', function(assert) {
  var clients = {
    dyno: dynamodb.dyno,
    kinesis: new AWS.Kinesis({
      region: '-',
      endpoint: 'http://localhost:7654',
      params: { StreamName: kinesis.streamName }
    })
  };

  var count = 0;
  var reader = kinesis.shards[0]()
    .on('error', function(err) {
      assert.ifError(err, 'should not error');
    })
    .on('data', function(records) {
      count += records.length;
      if (count >= fixtures.length) reader.close();
    })
    .on('end', function() {
      assert.equal(count, fixtures.length, 'scanned entire table and wrote each item to kinesis');
      assert.end();
    });

  var scan = touch.every(clients, function(err) {
    assert.ifError(err, 'success');
  });

  assert.ok(scan instanceof stream.Readable, 'touch.some returns scan stream');
});

kinesis.close();
dynamodb.close();
