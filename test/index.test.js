const test = require('node:test');
const assert = require('node:assert/strict');
const { greet } = require('../src/index');

test('greet returns the default message', () => {
  assert.equal(greet(), 'Hello, World!');
});

test('greet returns a personalized message', () => {
  assert.equal(greet('Node.js'), 'Hello, Node.js!');
});
