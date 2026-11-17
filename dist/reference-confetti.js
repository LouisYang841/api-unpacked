/* Confetti effect from peiping.html, LouisYang841/na2o2-chemistry.
 * Source revision: 9fae80ea7ae7519f283135234335091378b82523
 * Original particle motion, palette, dimensions and rendering retained.
 * Integration adds optional dialog hosting and an unavailable-canvas guard.
 */
(function () {
    var fx = document.getElementById('fx');
    if (!fx) return;
    var c;
    try { c = fx.getContext('2d'); } catch (_) { return; }
    if (!c) return;
    var parts = [], raf = null;
    var COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c'];

    function size() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        fx.width = Math.floor(window.innerWidth * dpr);
        fx.height = Math.floor(window.innerHeight * dpr);
        fx.style.width = window.innerWidth + 'px';
        fx.style.height = window.innerHeight + 'px';
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    window.burst = function (n, host) {
        if (host && fx.parentNode !== host) host.appendChild(fx);
        n = n || 50;
        var cx = window.innerWidth / 2;
        var cy = window.innerHeight * 0.4;
        for (var i = 0; i < n; i++) {
            parts.push({
                x: cx + (Math.random() - 0.5) * window.innerWidth * 0.55,
                y: cy + (Math.random() - 0.5) * 100,
                vx: (Math.random() - 0.5) * 9,
                vy: -Math.random() * 9 - 3,
                g: 0.26 + Math.random() * 0.16,
                w: 4 + Math.random() * 6,
                h: 6 + Math.random() * 8,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 0.35,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                life: 1
            });
        }
        if (!raf) loop();
    };

    function loop() {
        c.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (var i = parts.length - 1; i >= 0; i--) {
            var p = parts[i];
            p.vy += p.g;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.995;
            p.rot += p.vr;
            p.life -= 0.008;
            if (p.life <= 0 || p.y > window.innerHeight + 60) { parts.splice(i, 1); continue; }
            c.save();
            c.globalAlpha = Math.max(0, Math.min(1, p.life));
            c.translate(p.x, p.y);
            c.rotate(p.rot);
            c.fillStyle = p.color;
            c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            c.restore();
        }
        if (parts.length) raf = requestAnimationFrame(loop);
        else { raf = null; c.clearRect(0, 0, window.innerWidth, window.innerHeight); }
    }
})();
