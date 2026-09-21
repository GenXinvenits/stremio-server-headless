const fs = require('node:fs');

const file = 'server.js';
// v4.21.0 Node 26 compatibility build
let s = fs.readFileSync(file, 'utf8');

const required = {
  punycode: 'module.exports = require("punycode");',
  extend: 'util._extend(',
  urlParse: 'url.parse(',
};

if (!Object.values(required).some((needle) => s.includes(needle))) {
  console.log('server.js is already patched for Node 26');
  process.exit(0);
}
for (const [name, needle] of Object.entries(required)) {
  if (!s.includes(needle)) throw new Error('Expected Node 26 legacy API not found: ' + name);
}

s = s.replace(
  'module.exports = require("punycode");',
  'module.exports = { toASCII: function (domain) { return require("node:url").domainToASCII(domain); }, toUnicode: function (domain) { return require("node:url").domainToUnicode(domain); } };'
);

s = s.replace(/util\._extend\(/g, 'Object.assign(');

// Preserve the old Buffer constructor semantics without invoking the deprecated constructor.
s = s.replace(/new Buffer\(/g, '__node26Buffer(');
s = s.replace(/(^|[^.$\w])Buffer\(/g, '$1__node26Buffer(');

// Keep legacy url.parse() semantics for this bundled application while preventing
// Node 24+ application-deprecation noise. A later source-level migration can
// replace individual call sites with WHATWG URL APIs.
s = s.replace(/url\.parse\(/g, '__node26UrlParse(');

const shim = `var __node26Buffer=function(arg, encodingOrOffset, length) {
    return "number" == typeof arg ? Buffer.alloc(arg) : Buffer.from(arg, encodingOrOffset, length);
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
  remainingPunycode: (s.match(/module\\.exports = require\\("punycode"\\);/g) || []).length,
  remainingExtend: (s.match(/util\\._extend\\(/g) || []).length,
  remainingUrlParse: (s.match(/url\\.parse\\(/g) || []).length,
  remainingNewBuffer: (s.match(/new Buffer\\(/g) || []).length,
  remainingBufferCtor: (s.match(/(^|[^.$\\w])Buffer\\(/gm) || []).length,
});
