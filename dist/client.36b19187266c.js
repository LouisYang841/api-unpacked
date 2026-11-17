/*
ISC License

Copyright (c) 2020, Kiril Vatev

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

*/
// canvas-confetti v1.9.4 built on 2025-10-25T05:14:56.640Z
!(function (window, module) {
// source content
/* globals Map */

(function main(global, module, isWorker, workerSize) {
  var canUseWorker = !!(
    global.Worker &&
    global.Blob &&
    global.Promise &&
    global.OffscreenCanvas &&
    global.OffscreenCanvasRenderingContext2D &&
    global.HTMLCanvasElement &&
    global.HTMLCanvasElement.prototype.transferControlToOffscreen &&
    global.URL &&
    global.URL.createObjectURL);

  var canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';
  var canDrawBitmap = (function () {
    // this mostly supports ssr
    if (!global.OffscreenCanvas) {
      return false;
    }

    try {
      var canvas = new OffscreenCanvas(1, 1);
      var ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, 1, 1);
      var bitmap = canvas.transferToImageBitmap();
      ctx.createPattern(bitmap, 'no-repeat');
    } catch (e) {
      return false;
    }

    return true;
  })();

  function noop() {}

  // create a promise if it exists, otherwise, just
  // call the function directly
  function promise(func) {
    var ModulePromise = module.exports.Promise;
    var Prom = ModulePromise !== void 0 ? ModulePromise : global.Promise;

    if (typeof Prom === 'function') {
      return new Prom(func);
    }

    func(noop, noop);

    return null;
  }

  var bitmapMapper = (function (skipTransform, map) {
    // see https://github.com/catdad/canvas-confetti/issues/209
    // creating canvases is actually pretty expensive, so we should create a
    // 1:1 map for bitmap:canvas, so that we can animate the confetti in
    // a performant manner, but also not store them forever so that we don't
    // have a memory leak
    return {
      transform: function(bitmap) {
        if (skipTransform) {
          return bitmap;
        }

        if (map.has(bitmap)) {
          return map.get(bitmap);
        }

        var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        map.set(bitmap, canvas);

        return canvas;
      },
      clear: function () {
        map.clear();
      }
    };
  })(canDrawBitmap, new Map());

  var raf = (function () {
    var TIME = Math.floor(1000 / 60);
    var frame, cancel;
    var frames = {};
    var lastFrameTime = 0;

    if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
      frame = function (cb) {
        var id = Math.random();

        frames[id] = requestAnimationFrame(function onFrame(time) {
          if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
            lastFrameTime = time;
            delete frames[id];

            cb();
          } else {
            frames[id] = requestAnimationFrame(onFrame);
          }
        });

        return id;
      };
      cancel = function (id) {
        if (frames[id]) {
          cancelAnimationFrame(frames[id]);
        }
      };
    } else {
      frame = function (cb) {
        return setTimeout(cb, TIME);
      };
      cancel = function (timer) {
        return clearTimeout(timer);
      };
    }

    return { frame: frame, cancel: cancel };
  }());

  var getWorker = (function () {
    var worker;
    var prom;
    var resolves = {};

    function decorate(worker) {
      function execute(options, callback) {
        worker.postMessage({ options: options || {}, callback: callback });
      }
      worker.init = function initWorker(canvas) {
        var offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ canvas: offscreen }, [offscreen]);
      };

      worker.fire = function fireWorker(options, size, done) {
        if (prom) {
          execute(options, null);
          return prom;
        }

        var id = Math.random().toString(36).slice(2);

        prom = promise(function (resolve) {
          function workerDone(msg) {
            if (msg.data.callback !== id) {
              return;
            }

            delete resolves[id];
            worker.removeEventListener('message', workerDone);

            prom = null;

            bitmapMapper.clear();

            done();
            resolve();
          }

          worker.addEventListener('message', workerDone);
          execute(options, id);

          resolves[id] = workerDone.bind(null, { data: { callback: id }});
        });

        return prom;
      };

      worker.reset = function resetWorker() {
        worker.postMessage({ reset: true });

        for (var id in resolves) {
          resolves[id]();
          delete resolves[id];
        }
      };
    }

    return function () {
      if (worker) {
        return worker;
      }

      if (!isWorker && canUseWorker) {
        var code = [
          'var CONFETTI, SIZE = {}, module = {};',
          '(' + main.toString() + ')(this, module, true, SIZE);',
          'onmessage = function(msg) {',
          '  if (msg.data.options) {',
          '    CONFETTI(msg.data.options).then(function () {',
          '      if (msg.data.callback) {',
          '        postMessage({ callback: msg.data.callback });',
          '      }',
          '    });',
          '  } else if (msg.data.reset) {',
          '    CONFETTI && CONFETTI.reset();',
          '  } else if (msg.data.resize) {',
          '    SIZE.width = msg.data.resize.width;',
          '    SIZE.height = msg.data.resize.height;',
          '  } else if (msg.data.canvas) {',
          '    SIZE.width = msg.data.canvas.width;',
          '    SIZE.height = msg.data.canvas.height;',
          '    CONFETTI = module.exports.create(msg.data.canvas);',
          '  }',
          '}',
        ].join('\n');
        try {
          worker = new Worker(URL.createObjectURL(new Blob([code])));
        } catch (e) {
          // eslint-disable-next-line no-console
          typeof console !== 'undefined' && typeof console.warn === 'function' ? console.warn('🎊 Could not load worker', e) : null;

          return null;
        }

        decorate(worker);
      }

      return worker;
    };
  })();

  var defaults = {
    particleCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    gravity: 1,
    drift: 0,
    ticks: 200,
    x: 0.5,
    y: 0.5,
    shapes: ['square', 'circle'],
    zIndex: 100,
    colors: [
      '#26ccff',
      '#a25afd',
      '#ff5e7e',
      '#88ff5a',
      '#fcff42',
      '#ffa62d',
      '#ff36ff'
    ],
    // probably should be true, but back-compat
    disableForReducedMotion: false,
    scalar: 1
  };

  function convert(val, transform) {
    return transform ? transform(val) : val;
  }

  function isOk(val) {
    return !(val === null || val === undefined);
  }

  function prop(options, name, transform) {
    return convert(
      options && isOk(options[name]) ? options[name] : defaults[name],
      transform
    );
  }

  function onlyPositiveInt(number){
    return number < 0 ? 0 : Math.floor(number);
  }

  function randomInt(min, max) {
    // [min, max)
    return Math.floor(Math.random() * (max - min)) + min;
  }

  function toDecimal(str) {
    return parseInt(str, 16);
  }

  function colorsToRgb(colors) {
    return colors.map(hexToRgb);
  }

  function hexToRgb(str) {
    var val = String(str).replace(/[^0-9a-f]/gi, '');

    if (val.length < 6) {
        val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
    }

    return {
      r: toDecimal(val.substring(0,2)),
      g: toDecimal(val.substring(2,4)),
      b: toDecimal(val.substring(4,6))
    };
  }

  function getOrigin(options) {
    var origin = prop(options, 'origin', Object);
    origin.x = prop(origin, 'x', Number);
    origin.y = prop(origin, 'y', Number);

    return origin;
  }

  function setCanvasWindowSize(canvas) {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
  }

  function setCanvasRectSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function getCanvas(zIndex) {
    var canvas = document.createElement('canvas');

    canvas.style.position = 'fixed';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex;

    return canvas;
  }

  function ellipse(context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(radiusX, radiusY);
    context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
    context.restore();
  }

  function randomPhysics(opts) {
    var radAngle = opts.angle * (Math.PI / 180);
    var radSpread = opts.spread * (Math.PI / 180);

    return {
      x: opts.x,
      y: opts.y,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
      velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
      tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
      color: opts.color,
      shape: opts.shape,
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay,
      drift: opts.drift,
      random: Math.random() + 2,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0,
      gravity: opts.gravity * 3,
      ovalScalar: 0.6,
      scalar: opts.scalar,
      flat: opts.flat
    };
  }

  function updateFetti(context, fetti) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
    fetti.velocity *= fetti.decay;

    if (fetti.flat) {
      fetti.wobble = 0;
      fetti.wobbleX = fetti.x + (10 * fetti.scalar);
      fetti.wobbleY = fetti.y + (10 * fetti.scalar);

      fetti.tiltSin = 0;
      fetti.tiltCos = 0;
      fetti.random = 1;
    } else {
      fetti.wobble += fetti.wobbleSpeed;
      fetti.wobbleX = fetti.x + ((10 * fetti.scalar) * Math.cos(fetti.wobble));
      fetti.wobbleY = fetti.y + ((10 * fetti.scalar) * Math.sin(fetti.wobble));

      fetti.tiltAngle += 0.1;
      fetti.tiltSin = Math.sin(fetti.tiltAngle);
      fetti.tiltCos = Math.cos(fetti.tiltAngle);
      fetti.random = Math.random() + 2;
    }

    var progress = (fetti.tick++) / fetti.totalTicks;

    var x1 = fetti.x + (fetti.random * fetti.tiltCos);
    var y1 = fetti.y + (fetti.random * fetti.tiltSin);
    var x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
    var y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

    context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';

    context.beginPath();

    if (canUsePaths && fetti.shape.type === 'path' && typeof fetti.shape.path === 'string' && Array.isArray(fetti.shape.matrix)) {
      context.fill(transformPath2D(
        fetti.shape.path,
        fetti.shape.matrix,
        fetti.x,
        fetti.y,
        Math.abs(x2 - x1) * 0.1,
        Math.abs(y2 - y1) * 0.1,
        Math.PI / 10 * fetti.wobble
      ));
    } else if (fetti.shape.type === 'bitmap') {
      var rotation = Math.PI / 10 * fetti.wobble;
      var scaleX = Math.abs(x2 - x1) * 0.1;
      var scaleY = Math.abs(y2 - y1) * 0.1;
      var width = fetti.shape.bitmap.width * fetti.scalar;
      var height = fetti.shape.bitmap.height * fetti.scalar;

      var matrix = new DOMMatrix([
        Math.cos(rotation) * scaleX,
        Math.sin(rotation) * scaleX,
        -Math.sin(rotation) * scaleY,
        Math.cos(rotation) * scaleY,
        fetti.x,
        fetti.y
      ]);

      // apply the transform matrix from the confetti shape
      matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));

      var pattern = context.createPattern(bitmapMapper.transform(fetti.shape.bitmap), 'no-repeat');
      pattern.setTransform(matrix);

      context.globalAlpha = (1 - progress);
      context.fillStyle = pattern;
      context.fillRect(
        fetti.x - (width / 2),
        fetti.y - (height / 2),
        width,
        height
      );
      context.globalAlpha = 1;
    } else if (fetti.shape === 'circle') {
      context.ellipse ?
        context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) :
        ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
    } else if (fetti.shape === 'star') {
      var rot = Math.PI / 2 * 3;
      var innerRadius = 4 * fetti.scalar;
      var outerRadius = 8 * fetti.scalar;
      var x = fetti.x;
      var y = fetti.y;
      var spikes = 5;
      var step = Math.PI / spikes;

      while (spikes--) {
        x = fetti.x + Math.cos(rot) * outerRadius;
        y = fetti.y + Math.sin(rot) * outerRadius;
        context.lineTo(x, y);
        rot += step;

        x = fetti.x + Math.cos(rot) * innerRadius;
        y = fetti.y + Math.sin(rot) * innerRadius;
        context.lineTo(x, y);
        rot += step;
      }
    } else {
      context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
      context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
      context.lineTo(Math.floor(x2), Math.floor(y2));
      context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
    }

    context.closePath();
    context.fill();

    return fetti.tick < fetti.totalTicks;
  }

  function animate(canvas, fettis, resizer, size, done) {
    var animatingFettis = fettis.slice();
    var context = canvas.getContext('2d');
    var animationFrame;
    var destroy;

    var prom = promise(function (resolve) {
      function onDone() {
        animationFrame = destroy = null;

        context.clearRect(0, 0, size.width, size.height);
        bitmapMapper.clear();

        done();
        resolve();
      }

      function update() {
        if (isWorker && !(size.width === workerSize.width && size.height === workerSize.height)) {
          size.width = canvas.width = workerSize.width;
          size.height = canvas.height = workerSize.height;
        }

        if (!size.width && !size.height) {
          resizer(canvas);
          size.width = canvas.width;
          size.height = canvas.height;
        }

        context.clearRect(0, 0, size.width, size.height);

        animatingFettis = animatingFettis.filter(function (fetti) {
          return updateFetti(context, fetti);
        });

        if (animatingFettis.length) {
          animationFrame = raf.frame(update);
        } else {
          onDone();
        }
      }

      animationFrame = raf.frame(update);
      destroy = onDone;
    });

    return {
      addFettis: function (fettis) {
        animatingFettis = animatingFettis.concat(fettis);

        return prom;
      },
      canvas: canvas,
      promise: prom,
      reset: function () {
        if (animationFrame) {
          raf.cancel(animationFrame);
        }

        if (destroy) {
          destroy();
        }
      }
    };
  }

  function confettiCannon(canvas, globalOpts) {
    var isLibCanvas = !canvas;
    var allowResize = !!prop(globalOpts || {}, 'resize');
    var hasResizeEventRegistered = false;
    var globalDisableForReducedMotion = prop(globalOpts, 'disableForReducedMotion', Boolean);
    var shouldUseWorker = canUseWorker && !!prop(globalOpts || {}, 'useWorker');
    var worker = shouldUseWorker ? getWorker() : null;
    var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
    var initialized = (canvas && worker) ? !!canvas.__confetti_initialized : false;
    var preferLessMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion)').matches;
    var animationObj;

    function fireLocal(options, size, done) {
      var particleCount = prop(options, 'particleCount', onlyPositiveInt);
      var angle = prop(options, 'angle', Number);
      var spread = prop(options, 'spread', Number);
      var startVelocity = prop(options, 'startVelocity', Number);
      var decay = prop(options, 'decay', Number);
      var gravity = prop(options, 'gravity', Number);
      var drift = prop(options, 'drift', Number);
      var colors = prop(options, 'colors', colorsToRgb);
      var ticks = prop(options, 'ticks', Number);
      var shapes = prop(options, 'shapes');
      var scalar = prop(options, 'scalar');
      var flat = !!prop(options, 'flat');
      var origin = getOrigin(options);

      var temp = particleCount;
      var fettis = [];

      var startX = canvas.width * origin.x;
      var startY = canvas.height * origin.y;

      while (temp--) {
        fettis.push(
          randomPhysics({
            x: startX,
            y: startY,
            angle: angle,
            spread: spread,
            startVelocity: startVelocity,
            color: colors[temp % colors.length],
            shape: shapes[randomInt(0, shapes.length)],
            ticks: ticks,
            decay: decay,
            gravity: gravity,
            drift: drift,
            scalar: scalar,
            flat: flat
          })
        );
      }

      // if we have a previous canvas already animating,
      // add to it
      if (animationObj) {
        return animationObj.addFettis(fettis);
      }

      animationObj = animate(canvas, fettis, resizer, size , done);

      return animationObj.promise;
    }

    function fire(options) {
      var disableForReducedMotion = globalDisableForReducedMotion || prop(options, 'disableForReducedMotion', Boolean);
      var zIndex = prop(options, 'zIndex', Number);

      if (disableForReducedMotion && preferLessMotion) {
        return promise(function (resolve) {
          resolve();
        });
      }

      if (isLibCanvas && animationObj) {
        // use existing canvas from in-progress animation
        canvas = animationObj.canvas;
      } else if (isLibCanvas && !canvas) {
        // create and initialize a new canvas
        canvas = getCanvas(zIndex);
        document.body.appendChild(canvas);
      }

      if (allowResize && !initialized) {
        // initialize the size of a user-supplied canvas
        resizer(canvas);
      }

      var size = {
        width: canvas.width,
        height: canvas.height
      };

      if (worker && !initialized) {
        worker.init(canvas);
      }

      initialized = true;

      if (worker) {
        canvas.__confetti_initialized = true;
      }

      function onResize() {
        if (worker) {
          // TODO this really shouldn't be immediate, because it is expensive
          var obj = {
            getBoundingClientRect: function () {
              if (!isLibCanvas) {
                return canvas.getBoundingClientRect();
              }
            }
          };

          resizer(obj);

          worker.postMessage({
            resize: {
              width: obj.width,
              height: obj.height
            }
          });
          return;
        }

        // don't actually query the size here, since this
        // can execute frequently and rapidly
        size.width = size.height = null;
      }

      function done() {
        animationObj = null;

        if (allowResize) {
          hasResizeEventRegistered = false;
          global.removeEventListener('resize', onResize);
        }

        if (isLibCanvas && canvas) {
          if (document.body.contains(canvas)) {
            document.body.removeChild(canvas);
          }
          canvas = null;
          initialized = false;
        }
      }

      if (allowResize && !hasResizeEventRegistered) {
        hasResizeEventRegistered = true;
        global.addEventListener('resize', onResize, false);
      }

      if (worker) {
        return worker.fire(options, size, done);
      }

      return fireLocal(options, size, done);
    }

    fire.reset = function () {
      if (worker) {
        worker.reset();
      }

      if (animationObj) {
        animationObj.reset();
      }
    };

    return fire;
  }

  // Make default export lazy to defer worker creation until called.
  var defaultFire;
  function getDefaultFire() {
    if (!defaultFire) {
      defaultFire = confettiCannon(null, { useWorker: true, resize: true });
    }
    return defaultFire;
  }

  function transformPath2D(pathString, pathMatrix, x, y, scaleX, scaleY, rotation) {
    var path2d = new Path2D(pathString);

    var t1 = new Path2D();
    t1.addPath(path2d, new DOMMatrix(pathMatrix));

    var t2 = new Path2D();
    // see https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix/DOMMatrix
    t2.addPath(t1, new DOMMatrix([
      Math.cos(rotation) * scaleX,
      Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY,
      Math.cos(rotation) * scaleY,
      x,
      y
    ]));

    return t2;
  }

  function shapeFromPath(pathData) {
    if (!canUsePaths) {
      throw new Error('path confetti are not supported in this browser');
    }

    var path, matrix;

    if (typeof pathData === 'string') {
      path = pathData;
    } else {
      path = pathData.path;
      matrix = pathData.matrix;
    }

    var path2d = new Path2D(path);
    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');

    if (!matrix) {
      // attempt to figure out the width of the path, up to 1000x1000
      var maxSize = 1000;
      var minX = maxSize;
      var minY = maxSize;
      var maxX = 0;
      var maxY = 0;
      var width, height;

      // do some line skipping... this is faster than checking
      // every pixel and will be mostly still correct
      for (var x = 0; x < maxSize; x += 2) {
        for (var y = 0; y < maxSize; y += 2) {
          if (tempCtx.isPointInPath(path2d, x, y, 'nonzero')) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      width = maxX - minX;
      height = maxY - minY;

      var maxDesiredSize = 10;
      var scale = Math.min(maxDesiredSize/width, maxDesiredSize/height);

      matrix = [
        scale, 0, 0, scale,
        -Math.round((width/2) + minX) * scale,
        -Math.round((height/2) + minY) * scale
      ];
    }

    return {
      type: 'path',
      path: path,
      matrix: matrix
    };
  }

  function shapeFromText(textData) {
    var text,
        scalar = 1,
        color = '#000000',
        // see https://nolanlawson.com/2022/04/08/the-struggle-of-using-native-emoji-on-the-web/
        fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "Twemoji Mozilla", "system emoji", sans-serif';

    if (typeof textData === 'string') {
      text = textData;
    } else {
      text = textData.text;
      scalar = 'scalar' in textData ? textData.scalar : scalar;
      fontFamily = 'fontFamily' in textData ? textData.fontFamily : fontFamily;
      color = 'color' in textData ? textData.color : color;
    }

    // all other confetti are 10 pixels,
    // so this pixel size is the de-facto 100% scale confetti
    var fontSize = 10 * scalar;
    var font = '' + fontSize + 'px ' + fontFamily;

    var canvas = new OffscreenCanvas(fontSize, fontSize);
    var ctx = canvas.getContext('2d');

    ctx.font = font;
    var size = ctx.measureText(text);
    var width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
    var height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);

    var padding = 2;
    var x = size.actualBoundingBoxLeft + padding;
    var y = size.actualBoundingBoxAscent + padding;
    width += padding + padding;
    height += padding + padding;

    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.fillStyle = color;

    ctx.fillText(text, x, y);

    var scale = 1 / scalar;

    return {
      type: 'bitmap',
      // TODO these probably need to be transfered for workers
      bitmap: canvas.transferToImageBitmap(),
      matrix: [scale, 0, 0, scale, -width * scale / 2, -height * scale / 2]
    };
  }

  module.exports = function() {
    return getDefaultFire().apply(this, arguments);
  };
  module.exports.reset = function() {
    getDefaultFire().reset();
  };
  module.exports.create = confettiCannon;
  module.exports.shapeFromPath = shapeFromPath;
  module.exports.shapeFromText = shapeFromText;
}((function () {
  if (typeof window !== 'undefined') {
    return window;
  }

  if (typeof self !== 'undefined') {
    return self;
  }

  return this || {};
})(), module, false));

// end source content

  window.confetti = module.exports;
}(window, {}));

;
(function (root) {
  const prompts = { ui: '用一句话解释彩虹。', write: '用一句话解释月食。' };
  const norm = (s) =>
    String(s ?? '')
      .trim()
      .replace(/[。.!！?？\s]+$/u, '');
  function validateBody(body, prompt) {
    const errors = [];
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return ['正文应是用花括号包起来的 JSON 对象。'];
    if (body.model !== 'demo-small') errors.push('模型名称应为 "demo-small"。');
    if (!Array.isArray(body.messages))
      return [...errors, 'messages 应是由方括号包起来的消息列表。'];
    if (body.messages.length !== 2)
      errors.push('本题保留两条消息：一条 system 指令和一条 user 提问。');
    const [system, user] = body.messages;
    if (system?.role !== 'system' || system?.content !== '你是一位耐心的老师。')
      errors.push('请保留已填好的 system 消息，它用于设定模型的整体行为。');
    if (user?.role !== 'user')
      errors.push(
        '这句话是用户在提问，所以第二条消息的 role 应是 "user"，而不是 assistant 或 system。',
      );
    if (
      typeof user?.content !== 'string' ||
      norm(user.content) !== norm(prompt)
    )
      errors.push('content 是具体说的话；本题请填写“' + prompt + '”。');
    const extra = Object.keys(body).filter(
      (k) => !['model', 'messages'].includes(k),
    );
    if (extra.length)
      errors.push(
        '本题只需 model 和 messages 两个顶层字段，请移除额外字段：' +
          extra.join('、') +
          '。',
      );
    return errors;
  }
  function normalizeBaseUrl(value) {
    const clean = String(value ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (
      [
        'https://api.example.com',
        'https://api.example.com/v1',
        'https://api.example.com/v1/chat/completions',
        'https://api.example.com/v1/responses',
      ].includes(clean)
    )
      return 'https://api.example.com/v1';
    return clean;
  }
  function composeEndpoint(value, useResponses = false) {
    const base = normalizeBaseUrl(value);
    return base
      ? base + (useResponses ? '/responses' : '/chat/completions')
      : '';
  }
  function generateTeachingKey(cryptoSource = root.crypto) {
    const bytes = new Uint8Array(8);
    cryptoSource.getRandomValues(bytes);
    return (
      'demo-key-' +
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
  function validateKey(value, validKeys) {
    const errors = [];
    if (!validKeys?.size) errors.push('请先在服务商控制台创建 API 密钥。');
    const key = String(value ?? '').trim();
    if (validKeys?.size && !validKeys.has(key))
      errors.push(
        /^Bearer\s|^Authorization:/i.test(key)
          ? 'API Key 字段只填写密钥值。'
          : '认证失败：密钥无效或已撤销。请从控制台复制一把有效密钥。',
      );
    return errors;
  }
  function validateConnection(data, validKeys) {
    const errors = validateKey(data.key, validKeys);
    if (normalizeBaseUrl(data.baseUrl) !== 'https://api.example.com/v1')
      errors.push('服务地址不正确。请填写 https://api.example.com/v1。');
    if (data.protocol !== 'openai')
      errors.push('接口类型不匹配。此服务使用 OpenAI 兼容格式。');
    if (data.model !== 'demo-small')
      errors.push('模型不可用，请选择 demo-small。');
    return errors;
  }
  function parseAndValidate(text, prompt = prompts.write) {
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return {
        errors: [
          'JSON 还不能被解析。检查英文双引号、逗号和括号；最后一项后面不能有逗号。解析器提示：' +
            e.message,
        ],
      };
    }
    return { body, errors: validateBody(body, prompt) };
  }
  const api = {
    prompts,
    validateBody,
    validateKey,
    generateTeachingKey,
    validateConnection,
    composeEndpoint,
    normalizeBaseUrl,
    parseAndValidate,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Lesson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

;
const $ = (id) => document.getElementById(id);
const completed = new Set();
const completedTasks = new Set();
const taskIds = [
  'api-basics',
  'key-management',
  'app-connection',
  'request-structure',
  'request-cards',
  'request-json',
  'troubleshooting',
];
const requirementTaskMap = {
  'concept-api': 'api-basics',
  'key-created': 'key-management',
  'exercise-ui': 'app-connection',
  'concept-request': 'request-structure',
  'exercise-drag': 'request-cards',
  'exercise-write': 'request-json',
  'concept-errors': 'troubleshooting',
};
const learningStorageKey = 'api-unpacked-learning-v1';
const answeredQuestions = new Set();
let activeKey = null;
let revealedKey = null;
let practiceKeysReady = false;
const validKeys = new Set();
const keyRecords = [];
const completedKeys = new Map();
const scenarioStates = new Map();
const confettiSurfaces = new WeakMap();
let fetchedConnection = null,
  savedConnection = null,
  connectionTested = false,
  pendingRevocation = null;
function feedback(id, errors, success) {
  const box = $('feedback-' + id);
  box.replaceChildren();
  box.className = 'feedback ' + (errors.length ? 'bad' : 'good');
  if (errors.length) {
    const title = document.createElement('strong');
    title.textContent = '请检查以下项目：';
    box.append(title);
    const list = document.createElement('ul');
    errors.forEach((e) => {
      const li = document.createElement('li');
      li.textContent = e;
      list.append(li);
    });
    box.append(list);
  } else {
    box.textContent = success;
    completed.add(id);
    completedKeys.set(id, requestKeyFor(id));
    rewardCorrectAnswer('exercise-' + id, box);
    updateProgress();
  }
}
function updateProgress() {
  $('progressText').textContent = completed.size + ' / 3';
  $('progressBar').style.width = (completed.size / 3) * 100 + '%';
  $('completion').hidden = completed.size !== 3;
  updateChapterMarks();
  refreshLessonGates();
}
function uiBody() {
  if ($('useResponses').checked)
    return {
      model: $('connectionModel').value || '__选择模型__',
      instructions: '你是一位耐心的老师。',
      input: Lesson.prompts.ui,
    };
  return {
    model: $('connectionModel').value || '__选择模型__',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      { role: 'user', content: Lesson.prompts.ui },
    ],
  };
}
function updatePreview(reset = true) {
  if (reset) {
    stopScenario('ui');
    invalidateConnection();
    $('feedback-ui').replaceChildren();
    $('uiResponse').hidden = false;
  }
  const endpoint = Lesson.composeEndpoint(
    $('baseUrl').value,
    $('useResponses').checked,
  );
  const key = $('apiKey').value.trim();
  // Never echo arbitrary entered credentials into the page or logs.
  $('livePreview').textContent =
    'POST ' +
    (endpoint || '__等待填写地址__') +
    '\nAuthorization: Bearer ' +
    (validKeys.has(key) ? key : key ? '••••••••' : '__等待填写密钥__') +
    '\nContent-Type: application/json\n\n' +
    JSON.stringify(uiBody(), null, 2);
  if ($('protocolType').value !== 'openai') {
    $('livePreview').textContent =
      '接口类型不匹配。此服务使用 OpenAI 兼容格式。';
  }
  syncPracticeKey();
  if (reset)
    $('uiResponse').textContent =
      '配置更新了。点击检测连接，观察地址、密钥与模型是否匹配。';
}
[
  'baseUrl',
  'apiKey',
  'connectionModel',
  'protocolType',
  'useResponses',
].forEach((id) => $(id).addEventListener('input', updatePreview));
updatePreview();
$('protocolType').addEventListener('change', () => {
  const openai = $('protocolType').value === 'openai';
  $('useResponses').disabled = !openai;
  if (!openai) $('useResponses').checked = false;
  $('protocolHelp').textContent = openai
    ? '可用接口：Chat Completions、Responses。'
    : '此服务使用 OpenAI 兼容格式。';
  updatePreview();
});
$('useResponses').addEventListener('change', () => updatePreview());
$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').setAttribute('aria-pressed', String(show));
  $('toggleKey').textContent = show ? '隐藏密钥' : '显示密钥';
});
function openConsoleDialog(id) {
  const dialog = $(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.classList.add('dialog-fallback');
  }
  dialog.querySelector('input,button')?.focus();
}
function closeConsoleDialog(id) {
  const dialog = $(id);
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  dialog.classList.remove('dialog-fallback');
  if (id === 'keyRevealDialog') eraseKeyReveal();
}
$('createKey').addEventListener('click', () => {
  $('keyName').value = '';
  $('keyName').removeAttribute('aria-invalid');
  $('keyNameError').textContent = '';
  openConsoleDialog('keyNameDialog');
  $('keyName').focus();
});
['cancelKeyName', 'closeKeyName'].forEach((id) =>
  $(id).addEventListener('click', () => {
    closeConsoleDialog('keyNameDialog');
    $('createKey').focus();
  }),
);
['cancelRevoke', 'closeRevoke'].forEach((id) =>
  $(id).addEventListener('click', () => {
    pendingRevocation = null;
    closeConsoleDialog('revokeDialog');
    $('createKey').focus();
  }),
);
['keyNameDialog', 'keyRevealDialog', 'revokeDialog'].forEach((id) => {
  $(id).addEventListener('cancel', (e) => {
    e.preventDefault();
    closeConsoleDialog(id);
    pendingRevocation = null;
    $('createKey').focus();
  });
  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConsoleDialog(id);
      pendingRevocation = null;
      $('createKey').focus();
    }
    if (e.key === 'Tab' && $(id).classList.contains('dialog-fallback')) {
      const nodes = [...$(id).querySelectorAll('input,button')].filter(
        (n) => !n.disabled,
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
});
function requestRevocation(key) {
  if (!validKeys.has(key)) return;
  pendingRevocation = key;
  const record = keyRecords.find((r) => r.key === key);
  $('revokeDescription').textContent =
    '即将撤销“' + record.label + '”（末尾 ' + key.slice(-4) + '）。';
  openConsoleDialog('revokeDialog');
}
$('confirmRevoke').addEventListener('click', () => {
  const key = pendingRevocation;
  pendingRevocation = null;
  closeConsoleDialog('revokeDialog');
  revokeTeachingKey(key);
  $('createKey').focus();
});
$('keyNameForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const label = $('keyName').value.trim();
  if (!label || label.length > 40) {
    $('keyNameError').textContent = '请输入 1—40 个字符的密钥名称。';
    $('keyName').setAttribute('aria-invalid', 'true');
    $('keyName').focus();
    return;
  }
  $('keyNameError').textContent = '';
  try {
    do {
      activeKey = Lesson.generateTeachingKey();
    } while (keyRecords.some((record) => record.key === activeKey));
    validKeys.add(activeKey);
    keyRecords.push({
      key: activeKey,
      label,
      createdAt: new Date().toISOString(),
      revoked: false,
    });
  } catch {
    $('keyIssueStatus').textContent = '密钥创建失败，请更新浏览器后重试。';
    $('keyNameError').textContent = $('keyIssueStatus').textContent;
    return;
  }
  closeConsoleDialog('keyNameDialog');
  revealedKey = activeKey;
  $('issuedKey').value = revealedKey;
  $('issuedKeyLabel').textContent = label;
  $('keyCopyStatus').textContent = '';
  syncTeachingKey();
  $('keyReceipt').hidden = false;
  openConsoleDialog('keyRevealDialog');
  $('createKey').disabled = false;
  $('createKey').textContent = '＋ 创建 API 密钥';
  $('keyIssueStatus').textContent =
    '密钥已创建。请复制密钥值，然后配置应用连接。';
  $('keyReceipt').classList.remove('key-arrival');
  void $('keyReceipt').offsetWidth;
  $('keyReceipt').classList.add('key-arrival');
  rewardCorrectAnswer('key-created', $('keyReceipt'));
  refreshLessonGates();
  $('issuedKey').focus();
});
$('copyKey').addEventListener('click', async () => {
  if (!revealedKey || !$('keyRevealDialog').hasAttribute('open')) return;
  try {
    if (!window.navigator.clipboard?.writeText) throw new Error('unavailable');
    await window.navigator.clipboard.writeText(revealedKey);
    $('keyCopyStatus').textContent = '密钥已复制。';
  } catch {
    $('issuedKey').focus();
    $('issuedKey').select?.();
    $('keyCopyStatus').textContent = '请选中上方密钥值并复制。';
  }
});
function eraseKeyReveal() {
  revealedKey = null;
  $('issuedKey').value = '';
  $('issuedKey').setAttribute('value', '');
  $('issuedKeyLabel').textContent = '';
  $('keyCopyStatus').textContent = '';
  $('keyReceipt').hidden = true;
}
['closeKeyReveal', 'finishKeyReveal'].forEach((id) =>
  $(id).addEventListener('click', () => {
    closeConsoleDialog('keyRevealDialog');
    $('createKey').focus();
  }),
);
$('keyRevealDialog').addEventListener('close', eraseKeyReveal);
function requestKeyFor(id) {
  return id === 'ui'
    ? $('apiKey').value.trim()
    : id === 'write'
      ? $('writeKey').value.trim()
      : cards.find((c) => c.id === slots.auth)?.text || '';
}
function renderKeyList() {
  const list = $('keyList');
  list.replaceChildren();
  keyRecords.forEach((record) => {
    const li = document.createElement('li');
    li.dataset.keyId = 'key-' + (keyRecords.indexOf(record) + 1);
    li.className = 'key-record' + (record.revoked ? ' revoked' : '');
    const title = document.createElement('strong');
    title.textContent =
      record.label + (record.revoked ? ' · 已撤销' : ' · 有效');
    const code = document.createElement('code');
    code.textContent =
      record.key.slice(0, 9) + '••••••••' + record.key.slice(-4);
    const created = document.createElement('time');
    created.dateTime = record.createdAt;
    created.textContent =
      '创建于 ' +
      new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false });
    li.append(title, code, created);
    if (!record.revoked) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'text-button';
      revoke.textContent = '撤销这一把';
      revoke.addEventListener('click', () => requestRevocation(record.key));
      li.append(revoke);
    }
    list.append(li);
  });
  $('keyCount').textContent =
    validKeys.size + ' 把有效 / 共创建 ' + keyRecords.length + ' 把';
}
function revokeTeachingKey(key) {
  if (!validKeys.has(key)) return;
  validKeys.delete(key);
  keyRecords.find((r) => r.key === key).revoked = true;
  if (activeKey === key) activeKey = [...validKeys].at(-1) || null;
  ['ui', 'drag', 'write'].forEach((id) => {
    if (completedKeys.get(id) === key || scenarioStates.get(id)?.key === key) {
      completedKeys.delete(id);
      stopScenario(id, '本次请求使用的密钥已撤销，请换一把有效密钥。');
      $('feedback-' + id).replaceChildren();
      $(id + 'Response').hidden = true;
    }
  });
  syncTeachingKey();
  if (savedConnection?.key === key) {
    connectionTested = false;
    setConnectionNotice('已保存配置的密钥被撤销，请更换密钥并重新保存。', true);
  }
  updateProgress();
  $('keyIssueStatus').textContent = '密钥已撤销。';
}
const answers = {
  rainbow: '彩虹是阳光进入水滴后发生折射、反射和色散，分出不同颜色而形成的。',
  eclipse: '月食是地球运行到太阳与月球之间，使月球进入地球影子而变暗的现象。',
};
function showResponse(id, answer) {
  const scenarioId = id.replace('Response', '');
  runScenario(
    scenarioId,
    scenarioId === 'write' ? Lesson.prompts.write : Lesson.prompts.ui,
    answer,
  );
  const el = $(id);
  el.hidden = false;
  el.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = '200 OK';

  const raw = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '查看响应 JSON';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    id === 'uiResponse' && $('useResponses').checked
      ? {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: answer }],
            },
          ],
        }
      : { choices: [{ message: { role: 'assistant', content: answer } }] },
    null,
    2,
  );
  const note = document.createElement('span');
  note.textContent =
    id === 'uiResponse' && $('useResponses').checked
      ? '这条回复的文字位于 output[0].content[0].text。'
      : '回答在 choices[0].message.content 中。';
  raw.append(summary, pre, note);
  el.append(title, raw);
}
function makeOption(label, value) {
  const node = document.createElement('option');
  node.textContent = label;
  node.value = value;
  return node;
}
function connectionValues() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    key: $('apiKey').value.trim(),
    model: $('connectionModel').value,
    protocol: $('protocolType').value,
    useResponses: Boolean($('useResponses').checked),
  };
}
function sameConnection(a, b) {
  return (
    a &&
    b &&
    a.baseUrl === b.baseUrl &&
    a.key === b.key &&
    a.model === b.model &&
    a.protocol === b.protocol &&
    a.useResponses === b.useResponses
  );
}
function setConnectionNotice(message, bad = false) {
  $('connectionStatus').textContent = message;
  $('connectionStatus').classList.toggle('status-error', bad);
}
function invalidateConnection() {
  connectionTested = false;
  $('testConnection').disabled = true;
  const values = connectionValues();
  if (
    fetchedConnection &&
    (values.baseUrl !== fetchedConnection.baseUrl ||
      values.key !== fetchedConnection.key ||
      values.protocol !== fetchedConnection.protocol ||
      values.useResponses !== fetchedConnection.useResponses)
  ) {
    fetchedConnection = null;
    $('connectionModel').replaceChildren(makeOption('请先获取模型列表', ''));
    $('connectionModel').disabled = true;
    $('modelStatus').textContent = '连接地址或密钥已变更，请重新获取模型列表。';
  }
  setConnectionNotice(
    savedConnection
      ? '配置已修改，请重新保存并检测连接。'
      : '请先填写地址与密钥，再获取模型列表。',
  );
}
$('fetchModels').addEventListener('click', () => {
  const values = connectionValues(),
    errors = Lesson.validateConnection(
      { ...values, model: 'demo-small' },
      validKeys,
    );
  if (errors.length) {
    $('modelStatus').textContent = errors[0];
    setConnectionNotice('未能获取模型，请检查地址与密钥。', true);
    return;
  }
  fetchedConnection = { ...values };
  $('connectionModel').replaceChildren(
    makeOption('请选择模型', ''),
    makeOption('demo-small', 'demo-small'),
  );
  $('connectionModel').disabled = false;
  $('modelStatus').textContent = '已获取 1 个模型，请选择 demo-small。';
  setConnectionNotice('模型列表已更新。选择模型后，点击“保存配置”。');
});
$('requestForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const values = connectionValues(),
    errors = Lesson.validateConnection(values, validKeys);
  if (!fetchedConnection)
    errors.push('请先点击“获取模型列表”，再选择服务商提供的模型。');
  if (errors.length) {
    setConnectionNotice(errors.join(' '), true);
    scenarioError('ui', errors);
    return;
  }
  savedConnection = { ...values };
  connectionTested = false;
  $('testConnection').disabled = false;
  setConnectionNotice('配置已保存。请检测连接。');
});
$('providerEnabled').addEventListener('change', () => {
  connectionTested = false;
  $('testConnection').disabled = !savedConnection;
  stopScenario('ui');
  setConnectionNotice(
    $('providerEnabled').checked
      ? '服务商已启用，请检测连接。'
      : '服务商已停用，启用后才能检测或发送消息。',
  );
});
$('testConnection').addEventListener('click', () => {
  const errors = savedConnection
    ? Lesson.validateConnection(savedConnection, validKeys)
    : ['请先保存配置。'];
  if (!sameConnection(savedConnection, connectionValues()))
    errors.push('配置已变更，请重新保存。');
  if (!$('providerEnabled').checked) errors.push('请先启用此服务商。');
  if (errors.length) {
    connectionTested = false;
    setConnectionNotice(errors.join(' '), true);
    scenarioError('ui', errors);
    return;
  }
  connectionTested = true;
  feedback('ui', [], '连接成功，配置练习已完成。');
  setConnectionNotice('连接成功。现在可以发送消息。');
  $('scenario-status-ui').textContent =
    '服务商已连接 · demo-small 已选中 · 等待发送消息';
  flashSuccess($('connectionStatus'));
});
$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const errors = Lesson.validateConnection(connectionValues(), validKeys);
  if (!$('providerEnabled').checked)
    errors.unshift('服务商已停用，请先启用服务。');
  if (errors.length) {
    scenarioError('ui', errors);
    return;
  }
  showResponse('uiResponse', answers.rainbow);
});
['drag', 'write'].forEach((id) =>
  $('scenarioForm-' + id).addEventListener('submit', (event) => {
    event.preventDefault();
    $(id === 'drag' ? 'checkDrag' : 'checkWrite').click();
  }),
);
const cards = [
  { id: 'assistant', text: '"assistant"' },
  { id: 'content', text: '"用一句话解释彩虹。"' },
  { id: 'messages', text: '"messages"' },
  { id: 'auth', text: '先在连接设置中填写密钥' },
  { id: 'model', text: '"model"' },
];
let slots = { key: null, auth: null, content: null },
  selected = null;
function syncPracticeKey() {
  if (!practiceKeysReady) return;
  const entered = $('apiKey').value.trim(),
    key = validKeys.has(entered) ? entered : null;
  const card = cards.find((c) => c.id === 'auth');
  if (slots.auth && validKeys.has(card.text)) return;
  if (!validKeys.has(card.text)) slots.auth = null;
  const next = key || '先在连接设置中填写密钥';
  if (card.text !== next) {
    card.text = next;
    renderCards();
  }
}
function syncTeachingKey() {
  renderKeyList();
  syncPracticeKey();
  updatePreview(false);
}
const slotNames = { auth: '① 密钥', key: '② 字段名', content: '③ 提问内容' };
const dragAnnouncement = document.createElement('p');
dragAnnouncement.className = 'drag-help';
dragAnnouncement.setAttribute('role', 'status');
$('cardBank').after(dragAnnouncement);
function renderCards() {
  stopScenario('drag');
  const bank = $('cardBank');
  bank.replaceChildren();
  cards
    .filter((c) => !Object.values(slots).includes(c.id))
    .forEach((c) => {
      const b = document.createElement('button');
      b.className = 'card' + (selected === c.id ? ' selected' : '');
      b.textContent = c.text;
      b.disabled = c.id === 'auth' && !validKeys.has(c.text);
      b.draggable = !b.disabled;
      b.dataset.card = c.id;
      b.setAttribute('aria-pressed', String(selected === c.id));
      b.addEventListener('click', () => {
        selected = selected === c.id ? null : c.id;
        dragAnnouncement.textContent = selected
          ? '已选中 ' + c.text + '，请点击要放入的空位。'
          : '已取消选择。';
        renderCards();
        if (selected)
          document.querySelector('[data-card="' + selected + '"]').focus();
      });
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      bank.append(b);
    });
  document.querySelectorAll('[data-slot]').forEach((b) => {
    const c = cards.find((x) => x.id === slots[b.dataset.slot]);
    b.textContent = c ? c.text : slotNames[b.dataset.slot];
    const expected = { auth: 'auth', key: 'model', content: 'content' };
    b.classList.toggle(
      'filled',
      !!c &&
        slots[b.dataset.slot] === expected[b.dataset.slot] &&
        (b.dataset.slot !== 'auth' || validKeys.has(c.text)),
    );
    b.setAttribute(
      'aria-label',
      slotNames[b.dataset.slot] +
        (c ? '，已放入 ' + c.text + '，点击可取回' : '，点击放入已选卡片'),
    );
  });
  $('dragResponse').hidden = true;
}
function place(slot, card) {
  if (!cards.some((c) => c.id === card)) return;
  Object.keys(slots).forEach((k) => {
    if (slots[k] === card) slots[k] = null;
  });
  slots[slot] = card;
  selected = null;
  dragAnnouncement.textContent = '已放入 ' + slotNames[slot] + '。';
  renderCards();
}
document.querySelectorAll('[data-slot]').forEach((b) => {
  b.addEventListener('click', () => {
    const slot = b.dataset.slot;
    if (selected) {
      place(slot, selected);
    } else if (slots[slot]) {
      const old = slots[slot];
      slots[slot] = null;
      selected = old;
      dragAnnouncement.textContent = '已取回卡片，可以重新放置。';
      renderCards();
    } else {
      dragAnnouncement.textContent = '请先选择一张卡片，再点击这里。';
    }
  });
  b.addEventListener('dragover', (e) => {
    e.preventDefault();
    b.classList.add('over');
  });
  b.addEventListener('dragleave', () => b.classList.remove('over'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    b.classList.remove('over');
    place(b.dataset.slot, e.dataTransfer.getData('text/plain'));
  });
});
renderCards();
$('checkDrag').addEventListener('click', () => {
  const errors = Lesson.validateKey(
    slots.auth === 'auth' ? cards.find((c) => c.id === 'auth').text : '',
    validKeys,
  );
  if (slots.key !== 'model')
    errors.push('正文空位②后面是 demo-small，所以字段名应为 "model"。');
  if (slots.content !== 'content')
    errors.push('正文空位③应放入具体提问“用一句话解释彩虹。”。');
  feedback(
    'drag',
    errors,
    '拼对了！密钥位于 Authorization 请求头；模型和提问位于 JSON 正文。两部分一起构成应用发送的请求。',
  );
  if (!errors.length) showResponse('dragResponse', answers.rainbow);
  else {
    $('dragResponse').hidden = true;
    scenarioError('drag', errors);
  }
});
const skeleton = JSON.stringify(
  {
    model: '__填写__',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      { role: 'user', content: '__填写__' },
    ],
  },
  null,
  2,
);
$('jsonEditor').value = skeleton;
$('jsonEditor').addEventListener('input', () => {
  stopScenario('write');
  $('writeResponse').hidden = true;
});
$('formatJson').addEventListener('click', () => {
  try {
    $('jsonEditor').value = JSON.stringify(
      JSON.parse($('jsonEditor').value),
      null,
      2,
    );
    const el = $('feedback-write');
    el.className = 'feedback hint';
    el.textContent = '格式已整理。点击“检查并发送”查看结果。';
  } catch (e) {
    feedback(
      'write',
      ['暂时无法整理：JSON 存在语法错误。先检查双引号、逗号和括号。'],
      '',
    );
  }
});
$('checkWrite').addEventListener('click', () => {
  const result = Lesson.parseAndValidate($('jsonEditor').value);
  result.errors.unshift(...Lesson.validateKey($('writeKey').value, validKeys));
  feedback('write', result.errors, '填写正确。请求已发送，请观察返回的回答。');
  if (!result.errors.length) showResponse('writeResponse', answers.eclipse);
  else {
    $('writeResponse').hidden = true;
    scenarioError('write', result.errors);
  }
});
const hints = {
  ui: '先到第 2 步创建密钥。Base URL 填 https://api.example.com/v1；API Key 填控制台本次生成的密钥；模型选 demo-small。',
  drag: '① 控制台本次生成的密钥放在 Bearer 后面；② 模型字段名是 "model"；③ 放整句彩虹提问。密钥不属于 JSON。',
  write:
    '上方 Key 填控制台本次生成的密钥；下面 JSON 两个占位符按顺序替换成 demo-small、用一句话解释月食。保留双引号。',
};
$('writeKey').addEventListener('input', () => {
  stopScenario('write');
  const value = $('writeKey').value.trim();
  $('writeHeaderPreview').textContent =
    'Authorization: Bearer ' +
    (validKeys.has(value) ? value : value ? '••••••••' : '__填写密钥__');
  $('writeResponse').hidden = true;
});
document.querySelectorAll('[data-hint]').forEach((b) =>
  b.addEventListener('click', () => {
    const box = $('feedback-' + b.dataset.hint);
    box.className = 'feedback hint';
    box.textContent = hints[b.dataset.hint];
  }),
);
document.querySelectorAll('[data-reset]').forEach((b) =>
  b.addEventListener('click', () => {
    const id = b.dataset.reset;
    stopScenario(id);
    completed.delete(id);
    completedTasks.delete(
      { ui: 'app-connection', drag: 'request-cards', write: 'request-json' }[
        id
      ],
    );
    completedKeys.delete(id);
    updateProgress();
    $('feedback-' + id).replaceChildren();
    if (id === 'ui') {
      fetchedConnection = null;
      savedConnection = null;
      connectionTested = false;
      $('providerEnabled').checked = true;
      $('protocolType').value = 'openai';
      $('useResponses').checked = false;
      $('useResponses').disabled = false;
      $('connectionModel').replaceChildren(makeOption('请先获取模型列表', ''));
      $('connectionModel').disabled = true;
      $('modelStatus').textContent = '填写地址和密钥后，获取服务商提供的模型。';
      ['baseUrl', 'apiKey', 'connectionModel'].forEach(
        (id) => ($(id).value = ''),
      );
      $('apiKey').type = 'password';
      $('toggleKey').textContent = '显示密钥';
      $('toggleKey').setAttribute('aria-pressed', 'false');
      updatePreview();
    }
    if (id === 'drag') {
      slots = { key: null, auth: null, content: null };
      selected = null;
      dragAnnouncement.textContent = '已重置，可以重新选择卡片。';
      renderCards();
    }
    if (id === 'write') {
      $('jsonEditor').value = skeleton;
      $('writeKey').value = '';
      $('writeHeaderPreview').textContent =
        'Authorization: Bearer __填写密钥__';
      $('writeResponse').hidden = true;
    }
  }),
);

const chapterNames = [
  '先分清应用与服务商',
  '创建 API Key',
  '练习一：连接第三方应用',
  '应用怎样组成请求',
  '巩固练习：拖拽请求',
  '巩固练习：补全 JSON',
  '连不上时怎样排查',
  '迁移到真实应用',
];
const nextLabels = [
  '下一步：领取密钥 →',
  '下一步：连接第三方应用 →',
  '继续理解：应用怎样发请求 →',
  '巩固练习：用卡片拼请求 →',
  '巩固练习：自己补全 JSON →',
  '下一步：学会排查问题 →',
  '最后：迁移到真实应用 →',
];
const visited = new Set([0]);
let currentChapter = 0;
function updateChapterMarks() {
  for (let i = 0; i < chapterNames.length; i++) {
    $('chapter-mark-' + i).textContent =
      i === currentChapter ? ' ← 当前' : visited.has(i) ? ' · 已读' : '';
  }
  const pending = [
    ['ui', '第三方应用连接'],
    ['drag', '拖拽 JSON'],
    ['write', '补全 JSON'],
  ]
    .filter(([id]) => !completed.has(id))
    .map(([, name]) => name);
  $('reviewStatus').textContent = pending.length
    ? '尚可继续练习：' + pending.join('、') + '。可用下方按钮或目录返回。'
    : '已完成应用连接与两项请求拓展练习；可以带着迁移清单去配置可信的真实应用。';
}
function goToChapter(index, moveFocus = true) {
  if (!Number.isInteger(index) || index < 0 || index >= chapterNames.length)
    return;
  const blocked = firstIncompleteBefore(index);
  if (index > currentChapter && blocked !== null) {
    if (blocked !== currentChapter) goToChapter(blocked, moveFocus);
    refreshLessonGates();
    highlightUnfinishedQuestions(blocked);
    history.replaceState(null, '', '#step-' + currentChapter);
    return;
  }
  closeFieldHints();
  currentChapter = index;
  if (index !== 0) stopDemo();
  visited.add(index);
  document
    .querySelectorAll('[data-step]')
    .forEach((s) => (s.hidden = Number(s.dataset.step) !== index));
  $('chapterProgress').textContent =
    '当前：第 ' + (index + 1) + ' 步 / 共 ' + chapterNames.length + ' 步';
  $('readingBar').style.width = ((index + 1) / chapterNames.length) * 100 + '%';
  $('prevStep').disabled = index === 0;
  $('nextStep').hidden = index === chapterNames.length - 1;
  $('nextStep').textContent = nextLabels[index] || '';
  $('nextDescription').textContent =
    index === chapterNames.length - 1
      ? '本课结束，可以返回任意一步复习。'
      : '接下来：' + chapterNames[index + 1];
  document.querySelector('.contents').open = false;
  updateChapterMarks();
  history.replaceState(null, '', '#step-' + index);
  if (index === 0 && !reducedMotion() && !demoUserPaused) resumeDemo();
  refreshLessonGates();
  if (moveFocus) {
    $('heading-' + index).focus({ preventScroll: true });
    document.querySelector('.reading-progress').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }
}
$('prevStep').addEventListener('click', () => goToChapter(currentChapter - 1));
$('nextStep').addEventListener('click', () => goToChapter(currentChapter + 1));
document
  .querySelectorAll('[data-go]')
  .forEach((b) =>
    b.addEventListener('click', () => goToChapter(Number(b.dataset.go))),
  );

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function flashSuccess(element) {
  if (!element) return;
  element.classList.remove('success-flash');
  void element.offsetWidth;
  element.classList.add('success-flash');
}
function celebrate(element, questionId = '') {
  if (!element) return;
  flashSuccess(element);
  if (reducedMotion() || typeof window.confetti?.create !== 'function') return;
  const host = element.closest?.('dialog[open]') || document.body;
  let surface = confettiSurfaces.get(host);
  let createdCanvas = null;
  try {
    if (!surface || !surface.canvas.isConnected) {
      const canvas = document.createElement('canvas');
      createdCanvas = canvas;
      canvas.className = 'answer-confetti-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      host.append(canvas);
      if (!canvas.getContext('2d')) {
        canvas.remove();
        return;
      }
      const fire = window.confetti.create(canvas, {
        resize: true,
        useWorker: false,
        disableForReducedMotion: true,
      });
      surface = { canvas, fire, generation: 0 };
      confettiSurfaces.set(host, surface);
    }
    surface.canvas.dataset.questionId = questionId;
    const width =
      window.innerWidth || document.documentElement.clientWidth || 360;
    const height =
      window.innerHeight || document.documentElement.clientHeight || 720;
    const rect = element.getBoundingClientRect();
    const origin = {
      x: Math.max(0.08, Math.min(0.92, (rect.left + rect.width / 2) / width)),
      y: Math.max(
        0.12,
        Math.min(0.7, (rect.top + Math.min(rect.height, 100) / 2) / height),
      ),
    };
    const generation = ++surface.generation;
    const result = surface.fire({
      particleCount: 90,
      spread: 70,
      origin,
      startVelocity: 18,
      decay: 0.92,
      gravity: Math.max(6, height / 120),
      ticks: 300,
      zIndex: 3000,
      disableForReducedMotion: true,
    });
    const cleanup = () => {
      if (
        confettiSurfaces.get(host) === surface &&
        surface.generation === generation
      ) {
        confettiSurfaces.delete(host);
        surface.fire.reset();
        surface.canvas.remove();
      }
    };
    if (result && typeof result.then === 'function')
      result.then(cleanup, cleanup);
    window.setTimeout(cleanup, 1800);
  } catch {
    try {
      surface?.fire.reset();
    } catch {}
    (surface?.canvas || createdCanvas)?.remove();
    confettiSurfaces.delete(host);
  }
}
function stopScenario(id, message = '等待你完成请求设置。') {
  const state = scenarioStates.get(id);
  if (state) {
    window.clearInterval(state.timer);
    window.clearTimeout(state.wait);
    scenarioStates.delete(id);
  }
  const status = $('scenario-status-' + id);
  if (status) {
    status.textContent = message;
    status.className = 'scenario-status';
  }
  const messages = $('chat-messages-' + id);
  if (messages) {
    messages.replaceChildren();
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = '发送后，你的消息和模型回复会出现在这里。';
    messages.append(p);
  }
}
function scenarioError(id, errors) {
  stopScenario(id);
  let status = 400,
    label = '400 Bad Request',
    type = 'invalid_request_error',
    code = 'invalid_request',
    message = errors[0] || '请检查请求内容。';
  const key = requestKeyFor(id);
  if (id === 'ui' && !$('providerEnabled').checked) {
    status = null;
    label = '服务商未启用';
    type = 'configuration_error';
    code = 'provider_disabled';
    message = '请在设置中启用此服务商。';
  } else if (id === 'ui' && !$('baseUrl').value.trim()) {
    status = null;
    label = '连接失败';
    type = 'connection_error';
    code = 'missing_api_address';
    message = '尚未设置 API 地址。';
  } else if (
    id === 'ui' &&
    Lesson.normalizeBaseUrl($('baseUrl').value) !== 'https://api.example.com/v1'
  ) {
    status = null;
    label = '连接失败';
    type = 'connection_error';
    code = 'connection_failed';
    message = '无法连接到该服务地址，请检查连接设置。';
  } else if (!validKeys.has(key)) {
    status = 401;
    label = '401 Unauthorized';
    type = 'authentication_error';
    code = key ? 'invalid_api_key' : 'missing_api_key';
    message = key ? 'API Key 无效或已撤销。' : '未提供 API Key。';
  } else if (id === 'ui' && $('protocolType').value !== 'openai') {
    code = 'incompatible_protocol';
    message = '接口类型不匹配，此服务使用 OpenAI 兼容格式。';
  } else if (id === 'ui' && !$('connectionModel').value) {
    code = 'missing_model';
    message = '请先选择模型。';
  } else if (id === 'ui' && $('connectionModel').value !== 'demo-small') {
    status = 404;
    label = '404 Not Found';
    code = 'model_not_found';
    message = '未找到所选模型。';
  } else if (id === 'write') {
    try {
      const body = JSON.parse($('jsonEditor').value);
      if (
        body &&
        typeof body === 'object' &&
        body.model &&
        body.model !== 'demo-small'
      ) {
        status = 404;
        label = '404 Not Found';
        code = 'model_not_found';
        message = '未找到所选模型。';
      }
    } catch {
      code = 'invalid_json';
      message = '请求正文不是有效的 JSON。';
    }
  }
  const state = $('scenario-status-' + id);
  state.classList.add('failed');
  state.textContent = label;
  const bubble = document.createElement('div');
  bubble.className = 'chat-error';
  const text = document.createElement('p');
  text.textContent = message;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify({ error: { message, type, code } }, null, 2);
  bubble.append(text, pre);
  $('chat-messages-' + id).replaceChildren(bubble);
}
function runScenario(id, prompt, answer) {
  stopScenario(id);
  const messages = $('chat-messages-' + id),
    status = $('scenario-status-' + id);
  messages.replaceChildren();
  const user = document.createElement('div');
  user.className = 'chat-bubble user-bubble';
  user.textContent = prompt;
  messages.append(user);
  const reply = document.createElement('div');
  reply.className = 'chat-bubble model-bubble';
  reply.textContent = '模型正在思考…';
  messages.append(reply);
  $('scenario-' + id).scrollIntoView({
    behavior: reducedMotion() ? 'instant' : 'smooth',
    block: 'nearest',
  });
  const state = { timer: null, wait: null, key: requestKeyFor(id) };
  scenarioStates.set(id, state);
  status.textContent = '请求已发送 → 验证密钥 → 等待回复';
  status.classList.add('working');
  function finish() {
    window.clearInterval(state.timer);
    reply.textContent = answer;
    reply.classList.remove('streaming');
    status.textContent = '回复完成 · 200 OK';
    status.className = 'scenario-status complete';
    scenarioStates.delete(id);
    flashSuccess($('scenario-' + id));
  }
  if (reducedMotion()) {
    finish();
    return;
  }
  state.wait = window.setTimeout(() => {
    if (scenarioStates.get(id) !== state) return;
    reply.textContent = '';
    reply.classList.add('streaming');
    status.textContent = '密钥验证通过 → 正在逐段接收回答…';
    let pos = 0;
    state.timer = window.setInterval(() => {
      if (scenarioStates.get(id) !== state) return;
      pos += 2;
      reply.textContent = answer.slice(0, pos);
      messages.scrollTop = messages.scrollHeight;
      if (pos >= answer.length) finish();
    }, 65);
  }, 650);
}
const demoCaptions = [
  '应用读取 Base URL、API Key 和模型设置，准备你的提问。',
  '应用拼出完整地址，把密钥放进请求头，把模型与消息放进正文。',
  '服务验证密钥和权限。验证通过后，模型开始处理这条消息。',
  '响应逐段返回。应用把收到的文字显示在聊天窗口里。',
];
let demoStage = 0,
  demoTimer = null,
  demoUserPaused = false;
function paintDemo() {
  document
    .querySelectorAll('[data-demo-stage]')
    .forEach((n) =>
      n.classList.toggle('active', Number(n.dataset.demoStage) === demoStage),
    );
  $('animationTrack').style.setProperty('--phase', demoStage);
  $('animationCaption').textContent = demoCaptions[demoStage];
}
function stopDemo() {
  if (demoTimer !== null) {
    window.clearInterval(demoTimer);
    demoTimer = null;
  }
  $('playDemo').textContent = '继续播放 ▶';
}
function resumeDemo() {
  if (demoTimer !== null) return;
  $('playDemo').textContent = '暂停演示 Ⅱ';
  demoTimer = window.setInterval(() => {
    demoStage = (demoStage + 1) % demoCaptions.length;
    paintDemo();
  }, 1800);
}
$('playDemo').addEventListener('click', () => {
  if (demoTimer !== null) {
    demoUserPaused = true;
    stopDemo();
  } else {
    demoUserPaused = false;
    resumeDemo();
  }
});
$('stepDemo').addEventListener('click', () => {
  demoUserPaused = true;
  stopDemo();
  demoStage = (demoStage + 1) % demoCaptions.length;
  paintDemo();
});
$('replayDemo').addEventListener('click', () => {
  stopDemo();
  demoStage = 0;
  demoUserPaused = false;
  paintDemo();
  resumeDemo();
});
paintDemo();
if (reducedMotion()) $('playDemo').textContent = '播放演示 ▶';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopDemo();
  else if (currentChapter === 0 && !demoUserPaused && !reducedMotion())
    resumeDemo();
});
const requirements = {
  0: [['concept-api', '完成 API 概念选择题']],
  1: [['key-created', '命名并创建至少一把有效密钥']],
  2: [['exercise-ui', '保存配置并检测连接']],
  3: [['concept-request', '答对请求组成选择题']],
  4: [['exercise-drag', '检查并通过请求头与 JSON 卡片练习']],
  5: [['exercise-write', '检查并通过 JSON 练习']],
  6: [['concept-errors', '答对认证故障选择题']],
  7: [],
};
function requirementDone(id) {
  if (completedTasks.has(requirementTaskMap[id])) return true;
  if (id === 'key-created') return validKeys.size > 0;
  if (id.startsWith('exercise-')) return completed.has(id.slice(9));
  return answeredQuestions.has(id);
}
function firstIncompleteBefore(index) {
  for (let i = 0; i < index; i++) {
    if (requirements[i].some(([id]) => !requirementDone(id))) return i;
  }
  return null;
}
function refreshLessonGates() {
  for (const [id, task] of Object.entries(requirementTaskMap))
    if (requirementDone(id)) completedTasks.add(task);
  const items = requirements[currentChapter],
    pending = items.filter(([id]) => !requirementDone(id));
  const earlier = firstIncompleteBefore(currentChapter);
  const next = $('nextStep');
  next.disabled = false;
  next.removeAttribute('disabled');
  next.setAttribute('aria-disabled', 'false');
  next.setAttribute('aria-describedby', 'pageRequirement');
  next.classList.remove('is-locked');
  next.textContent = nextLabels[currentChapter] || '';
  $('pageRequirement').textContent =
    earlier !== null
      ? '第 ' + (earlier + 1) + ' 步还有未完成的练习，请先返回完成。'
      : pending.length
        ? '本页还需完成：' + pending.map(([, name]) => name).join('；') + '。'
        : items.length
          ? '本页练习全部完成，可以继续。'
          : '本页没有待答题目，可以继续学习。';
  updateQuestionMarkers();
  $('pageRequirement').classList.toggle(
    'requirements-complete',
    pending.length === 0 && earlier === null,
  );
  document.querySelectorAll('[data-go]').forEach((button) => {
    const target = Number(button.dataset.go),
      locked =
        target > currentChapter && firstIncompleteBefore(target) !== null;
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked ? '请先完成前面各页的练习。' : '';
  });
  persistLearningState();
}
const requirementTargets = {
  'concept-api': '[data-question="concept-api"].quick-check',
  'key-created': '.provider-console',
  'exercise-ui': '#panel-ui',
  'concept-request': '[data-question="concept-request"].quick-check',
  'exercise-drag': '#panel-drag',
  'exercise-write': '#panel-write',
  'concept-errors': '[data-question="concept-errors"].quick-check',
};
function updateQuestionMarkers() {
  for (const [id, selector] of Object.entries(requirementTargets)) {
    const target = document.querySelector(selector),
      done = requirementDone(id);
    if (!target) continue;
    target.classList.add('requirement-target');
    target.classList.toggle('is-complete', done);
    if (done) {
      target.classList.remove('needs-attention');
      target
        .querySelectorAll('.question-field-missing')
        .forEach((node) => node.classList.remove('question-field-missing'));
    }
    let state = target.querySelector('.completion-state');
    if (!state) {
      state = document.createElement('span');
      state.className = 'completion-state sr-only';
      target.append(state);
    }
    state.textContent = done ? '本题已完成' : '本题待完成';
  }
}
function highlightUnfinishedQuestions(index) {
  const pending = requirements[index].filter(([id]) => !requirementDone(id));
  let first = null;
  pending.forEach(([id]) => {
    const target = document.querySelector(requirementTargets[id]);
    if (!target) return;
    target.classList.remove('needs-attention');
    void target.offsetWidth;
    target.classList.add('needs-attention');
    first ??= target;
  });
  if (index === 2) {
    const values = connectionValues();
    const checks = [
      [
        'baseUrl',
        Lesson.normalizeBaseUrl(values.baseUrl) ===
          'https://api.example.com/v1',
      ],
      ['apiKey', validKeys.has(values.key)],
      ['protocolType', values.protocol === 'openai'],
      ['connectionModel', values.model === 'demo-small'],
    ];
    checks.forEach(([id, ok]) =>
      $(id).classList.toggle('question-field-missing', !ok),
    );
    if (checks.every(([, ok]) => ok))
      $(
        savedConnection && sameConnection(savedConnection, values)
          ? 'testConnection'
          : 'saveConnection',
      ).classList.add('question-field-missing');
  }
  if (index === 4) {
    for (const [slot, expected] of Object.entries({
      auth: 'auth',
      key: 'model',
      content: 'content',
    }))
      document
        .querySelector('[data-slot="' + slot + '"]')
        .classList.toggle('question-field-missing', slots[slot] !== expected);
  }
  if (index === 5) {
    $('writeKey').classList.toggle(
      'question-field-missing',
      !validKeys.has($('writeKey').value.trim()),
    );
    $('jsonEditor').classList.toggle(
      'question-field-missing',
      Lesson.parseAndValidate($('jsonEditor').value).errors.length > 0,
    );
  }
  if (first) {
    first.setAttribute('tabindex', '-1');
    first.focus({ preventScroll: true });
    first.scrollIntoView({
      behavior: reducedMotion() ? 'instant' : 'smooth',
      block: 'center',
    });
  }
}
document.addEventListener('input', (event) =>
  event.target.classList?.remove('question-field-missing'),
);
function rewardCorrectAnswer(id, element) {
  celebrate(element, id);
  if (!reducedMotion()) {
    try {
      window.navigator.vibrate?.(18);
    } catch {}
  }
}
document.querySelectorAll('button[data-question]').forEach((button) =>
  button.addEventListener('click', () => {
    const id = button.dataset.question;
    if (answeredQuestions.has(id)) return;
    const result = $('result-' + id);
    if (button.dataset.correct === 'true') {
      answeredQuestions.add(id);
      result.textContent = '回答正确。' + result.dataset.explanation;
      button.classList.add('correct');
      document
        .querySelectorAll('button[data-question="' + id + '"]')
        .forEach((b) => (b.disabled = true));
      rewardCorrectAnswer(id, result);
      refreshLessonGates();
    } else {
      result.textContent = '请再想一想。' + result.dataset.explanation;
    }
  }),
);
document.querySelectorAll('.hint-trigger').forEach((button) => {
  button.addEventListener('mouseenter', () => positionFieldHint(button));
  button.addEventListener('focus', () => positionFieldHint(button));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeFieldHints();
    if (!wasOpen) {
      button.setAttribute('aria-expanded', 'true');
      delete button.parentElement.dataset.dismissed;
      button.parentElement.dataset.open = 'true';
      positionFieldHint(button);
    }
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFieldHints();
      button.blur();
    }
  });
});
function positionFieldHint(button) {
  delete button.parentElement.dataset.dismissed;
  const tip = $(button.getAttribute('aria-controls'));
  const rect = button.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 32);
  tip.style.width = width + 'px';
  tip.style.left =
    Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)) +
    'px';
  const height = tip.offsetHeight || 100;
  const below = rect.bottom + 8;
  tip.style.top =
    (below + height <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - height - 8)) + 'px';
}
function closeFieldHints() {
  document.querySelectorAll('.hint-trigger').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    delete button.parentElement.dataset.open;
    button.parentElement.dataset.dismissed = 'true';
  });
}
document.addEventListener('click', (event) => {
  if (!event.target.closest('.hint-wrap')) closeFieldHints();
});
document.addEventListener('scroll', closeFieldHints, true);
window.addEventListener('resize', closeFieldHints);
function persistLearningState() {
  const state = {
    version: 1,
    keys: keyRecords.map(({ key, label, createdAt, revoked }) => ({
      key,
      label,
      createdAt,
      revoked,
    })),
    tasks: Object.fromEntries(
      taskIds.filter((id) => completedTasks.has(id)).map((id) => [id, true]),
    ),
  };
  try {
    window.localStorage.setItem(learningStorageKey, JSON.stringify(state));
    $('storageStatus').textContent = '学习记录已保存在本机';
  } catch {
    $('storageStatus').textContent = '此浏览器未能保存学习记录';
  }
}
function restoreLearningState() {
  try {
    const raw = window.localStorage.getItem(learningStorageKey);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1) return;
    if (Array.isArray(state.keys))
      for (const record of state.keys) {
        if (
          !record ||
          typeof record.key !== 'string' ||
          !/^demo-key-[0-9a-f]{16}$/.test(record.key) ||
          typeof record.label !== 'string' ||
          !record.label.trim() ||
          record.label.length > 40 ||
          typeof record.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(record.createdAt)) ||
          typeof record.revoked !== 'boolean' ||
          keyRecords.some((existing) => existing.key === record.key)
        )
          continue;
        const key = {
          key: record.key,
          label: record.label,
          createdAt: record.createdAt,
          revoked: record.revoked,
        };
        keyRecords.push(key);
        if (!key.revoked) validKeys.add(key.key);
      }
    if (
      state.tasks &&
      typeof state.tasks === 'object' &&
      !Array.isArray(state.tasks)
    )
      for (const id of taskIds)
        if (state.tasks[id] === true) completedTasks.add(id);
    for (const [id, task] of Object.entries({
      ui: 'app-connection',
      drag: 'request-cards',
      write: 'request-json',
    }))
      if (completedTasks.has(task)) completed.add(id);
  } catch {}
  renderKeyList();
}
restoreLearningState();
practiceKeysReady = true;
syncPracticeKey();
updateProgress();
const initial = /^#step-([0-7])$/.exec(location.hash);
const requestedInitial = initial ? Number(initial[1]) : 0;
goToChapter(firstIncompleteBefore(requestedInitial) ?? requestedInitial, false);
window.addEventListener('hashchange', () => {
  const match = /^#step-([0-7])$/.exec(location.hash);
  if (match) goToChapter(Number(match[1]));
});
