var Dyno = require('dyno');
var crypto = require('crypto');
var stream = require('stream');

module.exports.one = one;
module.exports.some = some;
module.exports.every = every;

function one(key, clients, callback) {
  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    var writer = WriteStream(tableData.schema, tableData.table, clients.kinesis)
      .on('error', callback)
      .on('finish', callback);

    clients.dyno.getItem({ Key: key }, function(err, data) {
      if (err) return callback(err);
      writer.write(data.Item);
      writer.end();
    });
  });
}

function some(query, clients, callback) {
  var queryStream = clients.dyno.queryStream(query);

  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    queryStream
        .on('error', callback)
      .pipe(WriteStream(tableData.schema, tableData.table, clients.kinesis))
        .on('error', callback)
        .on('finish', callback);
  });

  return queryStream;
}

function every(clients, callback) {
  var scanStream = clients.dyno.scanStream();

  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    scanStream
        .on('error', callback)
      .pipe(WriteStream(tableData.schema, tableData.table, clients.kinesis))
        .on('error', callback)
        .on('finish', callback);
  });

  return scanStream;
}

function describe(dyno, callback) {
  dyno.describeTable({}, function(err, data) {
    if (err) return callback(err);

    callback(null, {
      table: data.Table.TableArn,
      schema: data.Table.KeySchema
    });
  });
}

function WriteStream(schema, tableArn, kinesis) {
  var writeStream = new stream.Writable({
    highWaterMark: 100,
    objectMode: true
  });

  writeStream._write = function(item, enc, callback) {
    var record = {
      eventId: '0',
      eventVersion: '1.0',
      eventName: 'INSERT',
      awsRegion: tableArn.split(':')[3],
      eventSourceARN: tableArn + '/dynamodb-touch',
      eventSource: 'dynamodb-touch',
      dynamodb: {
        Keys: JSON.parse(Dyno.serialize(schema.reduce(function(keys, key) {
          keys[key.AttributeName] = item[key.AttributeName];
          return keys;
        }, {}))),
        NewImage: JSON.parse(Dyno.serialize(item)),
        StreamViewType: 'NEW_IMAGE',
        SequenceNumber: '0'
      }
    };

    record.dynamodb.SizeBytes = (new Buffer(JSON.stringify(record.dynamodb.NewImage))).length;

    kinesis.putRecord({
      Data: JSON.stringify({ Records: [record] }),
      PartitionKey: crypto.createHash('md5').update(JSON.stringify(record.dynamodb.Keys)).digest('hex')
    }, callback);
  };

  return writeStream;
}
