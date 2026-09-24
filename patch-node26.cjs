const fs = require('node:fs');

const file = 'server.js';
let s = fs.readFileSync(file, 'utf8');

const required = {
  punycode: 'module.exports = require("punycode");',
  extend: 'util._extend(',
  urlParse: 'url.parse(',
  newBuffer: 'new Buffer(',
};

for (const [name, needle] of Object.entries(required)) {
  if (!s.includes(needle)) {
    throw new Error('Expected Node 26 legacy API not found: ' + name);
  }
}

// Avoid Node's deprecated builtin punycode module.
// The bundled consumer only needs the domain conversion APIs.
s = s.replace(
  'module.exports = require("punycode");',
  'module.exports = { toASCII: function (domain) { return require("node:url").domainToASCII(domain); }, toUnicode: function (domain) { return require("node:url").domainToUnicode(domain); } };'
);

// util._extend() -> Object.assign()
s = s.replace(/util\._extend\(/g, 'Object.assign(');

// Legacy Buffer constructor compatibility.
// Buffer(number) historically allocated an uninitialized buffer;
// use allocUnsafe for the closest semantic equivalent.
s = s.replace(
  /new Buffer\(/g,
  '__node26Buffer('
);

// Catch bare Buffer(...) calls while avoiding Buffer.from(), Buffer.alloc(), etc.
s = s.replace(
  /(^|[^.$\w])Buffer\(/g,
  '$1__node26Buffer('
);

// Preserve legacy url.parse() behavior while suppressing DEP0169.
s = s.replace(
  /url\.parse\(/g,
  '__node26UrlParse('
);

const shim = `var __node26Buffer=function(arg, encodingOrOffset, length) {
    return "number" == typeof arg ? Buffer.allocUnsafe(arg) : Buffer.from(arg, encodingOrOffset, length);
};
var __node26Url = require("node:url");
var __node26UrlParseNative = __node26Url.parse;
var __node26UrlParse = function() {
    var noDeprecation = process.noDeprecation;
    process.noDeprecation = true;
    try {
        return __node26UrlParseNative.apply(__node26Url, arguments);
    } finally {
        process.noDeprecation = noDeprecation;
    }
};

`;

s = shim + s;

fs.writeFileSync(file, s);

console.log('Node 26 compatibility patch applied:', {
  bytes: s.length,
  remainingPunycode:
    (s.match(/module\.exports = require\("punycode"\);/g) || []).length,
  remainingExtend:
    (s.match(/util\._extend\(/g) || []).length,
  remainingUrlParse:
    (s.match(/url\.parse\(/g) || []).length,
  remainingNewBuffer:
    (s.match(/new Buffer\(/g) || []).length,
  remainingBufferCtor:
    (s.match(/(^|[^.$\w])Buffer\(/gm) || []).length,
});
