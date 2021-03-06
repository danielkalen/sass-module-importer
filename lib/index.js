'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var glob = _interopDefault(require('glob'));
var path = _interopDefault(require('path'));
var Map = _interopDefault(require('es6-map'));
var assign = _interopDefault(require('object-assign'));
var npmResolve = _interopDefault(require('resolve'));
var bowerResolve = _interopDefault(require('resolve-bower'));

var extensions = /scss|sass|css/;

var ModuleImporter = function ModuleImporter(opts) {
  this.aliases = new Map();
  this.options = assign({}, { packageFilter: this.filter }, opts);
};

ModuleImporter.prototype.resolve = function resolve(ref) {
  var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;

    var fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);
  var extname = path.extname(fullPath);

  if (extname === '.js') {
    return Promise.resolve({ contents: '' });
  }

  if (this.aliases.has(fullPath)) {
    return Promise.resolve(this.aliases.get(fullPath));
  }

  var dirName = path.dirname(fullPath);
  var fileName = "?(_)" + (path.basename(fullPath)) + ".+(scss|sass|css)";
  var matches = glob.sync(path.join(dirName, fileName));

  if (matches.length > 0) {
    return Promise.resolve({ file: fullPath });
  }

  return Promise.resolve({ url: url, prev: prev })
    .then(function ( file ) { return this$1.npm(file); })
    .then(function ( file ) { return this$1.bower(file); })
    .then(function ( file ) { return this$1.index(file); })
    .then(function ( file ) { return this$1.read(file); })
    .then(function (res) {
      if (res) {
        this$1.aliases.set(fullPath, res);
      }
      return res;
    });
};

ModuleImporter.prototype.filter = function filter(pkg) {
  var regex = /\.s?[c|a]ss$/;
  if (!pkg.main ||
     (typeof pkg.main !== 'string') ||
     (pkg.main && !pkg.main.match(regex))) {
    if (typeof pkg.main === 'object') {
      pkg.main = pkg.main.find(function ( elem ) { return elem.match(regex); });
    } else {
      pkg.main = pkg.style || pkg.sass || pkg['main.scss'] || pkg['main.sass'] || 'index.css';
    }
  }
  return pkg;
};

ModuleImporter.prototype.find = function find(resolver, ref) {
  var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    return new Promise(function (resolve) {
    if (resolved) {
      resolve({ url: url, prev: prev, resolved: resolved });
    } else {
      resolver(url, this$1.options, function (err, res) {
          resolve({ url: (err ? url : res), prev: prev, resolved: !err });
      });
    }
  });
};

ModuleImporter.prototype.index = function index(ref) {
  var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    return new Promise(function (resolve) {
    if (resolved) {
      resolve({ url: url, prev: prev, resolved: resolved });
    } else {
      var fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);

      fs.readdir(fullPath, function (err, files) {
        if (err) return resolve({ url: url, prev: prev, resolved: resolved });
        var resolvedURL = url;
        var match = files.find(function (file) { return file.includes('index.') && extensions.test(path.extname(file)); });
        if (match) {
          resolvedURL = path.resolve(fullPath, match);
        }
        return resolve({ url: resolvedURL, prev: prev, resolved: !!match });
      });
    }
  });
};

ModuleImporter.prototype.read = function read(ref) {
  var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    return new Promise(function (resolve, reject) {
    if (!resolved) {
      resolve();
    } else {
      if (url.match(/\.css$/)) {
        fs.readFile(url, 'utf8', function (err, contents) {
          if (err) {
            reject(err);
          } else {
            resolve({ contents: contents });
          }
        });
      } else {
        var resolvedURL = url;
        if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
          resolvedURL = path.resolve(path.dirname(prev), url);
        }
        resolve({ file: resolvedURL });
      }
    }
  });
};

ModuleImporter.prototype.npm = function npm(file) {
  return this.find(npmResolve, file);
};

ModuleImporter.prototype.bower = function bower(file) {
  return this.find(bowerResolve, file);
};


/**
 * Look for Sass files installed through npm
 * @param opts {Object}       Options to be passed to the resolver module
 *
 * @return {Function}         Function to be used by node-sass importer
 */
function index (opts) {
  var importer = new ModuleImporter(opts);

  return function (url, prev, done) {
    importer.resolve({ url: url, prev: prev })
      .then(done)
      .catch(function ( err ) { return setImmediate(function () { throw err; }); });
  };
}

module.exports = index;