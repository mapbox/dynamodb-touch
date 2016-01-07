# dynamodb-touch

[![Build Status](https://travis-ci.org/mapbox/dynamodb-touch.svg?branch=master)](https://travis-ci.org/mapbox/dynamodb-touch)

Simulated DynamoDB Stream events based on the contents of a DynamoDB table.

## What it does

Performs either a GetItem, Query, or Scan operation on a DynamoDB table, then
passes each resulting record into a Kinesis stream in a wrapper identical to
what would be provided by a DynamoDB stream `INSERT` event.

## How to use it

You must provide your own configured [Dyno](https://github.com/mapbox/dyno) and
Kinesis clients. The Kinesis client must be pre-configured to provide the stream
name with each request.

```js
var touch = require('dynamodb-touch');
var AWS = require('aws-sdk');
var Dyno = require('dyno');

var clients = {
  dyno: Dyno({
    table: 'my-dynamodb-table',
    region: 'us-east-1'
  }),
  kinesis: new AWS.Kinesis({
    region: 'us-east-1',
    params: { StreamName: 'my-kinesis-stream' }
  })
};

// send one event for a dynamodb record with the provided key
touch.one({ id: 'some-record' }, clients, function(err) {
  if (err) throw err;
});

// query dynmodb, sending events for each result
touch.some({
  KeyConditions: {
    id: {
      ComparisonOperator: 'EQ',
      AttributeValueList: ['some-record']
    }
  }
}, clients, function(err) {
  if (err) throw err;
});

// scan every record in dynamodb, sending events for each result
touch.every(clients, function(err) {
  if (err) throw err;
});
```

## What events in Kinesis will look like

A Kinesis event will contain a `Data` property. For dynamodb-touch events, this
will be a base64-encoded JSON string which mimics a DynamoDB Stream event.

```js
kinesis.getRecords({ ShardIterator: 'xyz' }, function(err, data) {
  var record = data.Records[0];
  var dynamodbEvent = JSON.parse((new Buffer(record.Data, 'base64')).toString());
  console.log(JSON.stringify(dynamodbEvent, null, 2));
});
```

... will console.log:

```json
{
  "eventId": "0",
  "eventVersion": "1.0",
  "awsRegion": "us-east-1",
  "eventSourceARN": "arn:aws:dynamodb:us-east-1:000000000000:table/my-dynamodb-table/dynamodb-touch",
  "eventSource": "dynamodb-touch",
  "eventName": "INSERT",
  "dynamodb": {
    "Keys": {
      "id": { "S": "my-record" }
    },
    "NewImage": {
      "id": { "S": "my-record" },
      "data": { "B": "aGVsbG8geW91" }
    },
    "StreamViewType": "NEW_IMAGE",
    "SequenceNumber": "0",
    "SizeBytes": 52
  }
}
```
