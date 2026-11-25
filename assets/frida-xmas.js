/* FRIDA · Weihnachts-Skin: Countdown, Mengenwahl und Schnee im Hero */
(function(){
  var hero = document.querySelector('[data-xhero]');
  if(!hero) return;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Desktop: das originale Flaschenfoto auf den Tisch des Szenenfotos stellen.
     Das Szenenfoto (Seitenverhältnis R, ohne Produkt) füllt die Hero-Höhe und ist an der
     Flaschenseite verankert. FX/FLOOR = freie Stelle auf dem Tisch im Foto.
     Für RTL wird nur der Hintergrund gespiegelt, die Flasche selbst nie.
     Mobil macht das CSS alles allein (eigenes Layout ohne Foto). */
  function set(name, px){ hero.style.setProperty(name, Math.round(px) + 'px'); }
  function place(){
    if(window.innerWidth <= 900) return;
    var R = 3856 / 2160, FX = 0.655, FLOOR = 0.2, BOTTLE = 330 / 812;
    var rtl = document.documentElement.getAttribute('dir') === 'rtl';
    var W = hero.clientWidth, H = hero.clientHeight;
    if(!W || !H) return;
    var iw = H * R;
    var bh = Math.min(640, Math.max(380, H * 0.62)), bw = bh * BOTTLE;
    /* in "Leserichtung" rechnen: 0 = Textseite, W = Flaschenseite */
    var hr = hero.getBoundingClientRect();
    var boxEl = hero.querySelector('.xhero-box') || hero.querySelector('.xhero-head');
    var edge = 0;
    if(boxEl){
      var br = boxEl.getBoundingClientRect();
      edge = rtl ? hr.right - br.left : br.right - hr.left;
    }
    var ox = W - iw;
    var minOx = edge + 28 + bw / 2 - iw * FX;
    if(ox < minOx) ox = Math.min(minOx, W - bw / 2 - 12 - iw * FX);
    var x = ox + iw * FX;
    set('--sc-x', ox);
    set('--sc-e', ox);
    set('--xhero-bx', rtl ? W - x : x);
    set('--xhero-bh', bh);
    set('--xhero-floor', H * FLOOR);
  }
  place();
  window.addEventListener('resize', place);
  window.addEventListener('load', place);

  /* Mengenwahl -> verstecktes quantity-Feld + Button-Preis */
  var qty = hero.querySelector('[name="quantity"]');
  var total = hero.querySelector('[data-xhero-total]');
  hero.addEventListener('change', function(e){
    var r = e.target.closest('[data-xhero-qty]');
    if(!r) return;
    if(qty) qty.value = r.value;
    if(total) total.textContent = r.getAttribute('data-total') || '';
  });

  /* Countdown */
  var box = hero.querySelector('[data-xhero-count]');
  if(box){
    var target = new Date(box.getAttribute('data-deadline')).getTime();
    var cells = {
      d: box.querySelector('[data-d]'), h: box.querySelector('[data-h]'),
      m: box.querySelector('[data-m]'), s: box.querySelector('[data-s]')
    };
    var pad = function(n){ return (n < 10 ? '0' : '') + n; };
    var tick = function(){
      var left = target - Date.now();
      if(isNaN(target) || left <= 0){ box.hidden = true; return false; }
      var sec = Math.floor(left / 1000);
      if(cells.d) cells.d.textContent = Math.floor(sec / 86400);
      if(cells.h) cells.h.textContent = pad(Math.floor(sec % 86400 / 3600));
      if(cells.m) cells.m.textContent = pad(Math.floor(sec % 3600 / 60));
      if(cells.s) cells.s.textContent = pad(sec % 60);
      return true;
    };
    if(tick()){
      box.hidden = false;
      var timer = setInterval(function(){ if(!tick()) clearInterval(timer); }, 1000);
    }
  }

  /* Schnee: nur solange der Hero sichtbar ist */
  var c = hero.querySelector('canvas[data-xhero-snow]');
  if(c && c.getContext){
    var g = c.getContext('2d'), P = [], running = false, visible = true;
    var n = window.innerWidth < 700 ? 40 : 80;
    var size = function(){ c.width = c.clientWidth; c.height = c.clientHeight; };
    size();
    window.addEventListener('resize', size);
    for(var i = 0; i < n; i++){
      P.push({x:Math.random(), y:Math.random(), r:.8 + Math.random()*2.4, v:.0006 + Math.random()*.0013, a:Math.random()*6.28, gold:i % 5 === 0});
    }
    var draw = function(){
      g.clearRect(0, 0, c.width, c.height);
      for(var i = 0; i < P.length; i++){
        var p = P[i];
        if(!still){ p.y += p.v; p.a += .01; if(p.y > 1.02){ p.y = -.02; p.x = Math.random(); } }
        g.globalAlpha = p.gold ? .75 : .55;
        g.fillStyle = p.gold ? '#f3e2b8' : '#ffffff';
        g.beginPath();
        g.arc(p.x*c.width + Math.sin(p.a)*8, p.y*c.height, p.r, 0, 6.28);
        g.fill();
      }
      if(!still && visible && !document.hidden) requestAnimationFrame(draw); else running = false;
    };
    var start = function(){ if(!running){ running = true; requestAnimationFrame(draw); } };
    start();
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(en){ visible = en[0].isIntersecting; if(visible) start(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) start(); });
  }
})();

/* v2 · Weihnachtsduft auf Produktkarten und auf der Produktseite hervorheben */
(function(){
  var cfg = window.fridaXmas;
  if(!cfg || !cfg.variantId) return;
  var S = cfg.strings || {};
  var label = 'Limited Edition · Vanilla & Cinnamon';

  /* Produktkarten (Startseite, Kollektionen, "Passt dazu").
     cfg.url ist die Produkt-URL in der aktuellen Sprache, weil Handles übersetzt sind. */
  document.querySelectorAll('[data-product-card]').forEach(function(card){
    var link = card.querySelector('.card-media a[href]');
    var href = link ? (link.getAttribute('href') || '').split('?')[0] : '';
    if(!cfg.url || href !== cfg.url || card.querySelector('.card-xmas-tag')) return;
    card.classList.add('card-xmas');
    var tag = document.createElement('span');
    tag.className = 'card-xmas-tag';
    tag.textContent = label;
    card.querySelector('.card-media').appendChild(tag);
  });

  /* Produktseite */
  /* Erkennung über die Varianten-ID: Namen und Handles sind je Sprache übersetzt */
  var jsonEl = document.getElementById('ProductJson'), variants = [];
  if(!jsonEl) return;
  try{ variants = JSON.parse(jsonEl.textContent) || []; }catch(e){ return; }
  var xv = null;
  variants.forEach(function(v){ if(String(v.id) === String(cfg.variantId)) xv = v; });
  if(!xv) return;
  var chip = null;
  document.querySelectorAll('.scent-opt[data-value]').forEach(function(b){
    if(!chip && (xv.options || []).indexOf(b.getAttribute('data-value')) !== -1) chip = b;
  });
  if(!chip) return;
  chip.classList.add('scent-xmas');

  var info = document.querySelector('.pdp-info');
  var form = document.getElementById('productForm');
  if(info && form && !info.querySelector('.pdp-xmas-note')){
    var note = document.createElement('div');
    note.className = 'pdp-xmas-note';
    note.innerHTML =
      '<span class="x-eyebrow">' + (S.eyebrow || 'Limited Edition') + '</span>' +
      '<p>' + (S.sub || '') + '</p>' +
      '<div class="x-notes"><span>' + (S.note_vanilla || 'Vanilla') + '</span><span>' + (S.note_cinnamon || 'Cinnamon') + '</span><span>' + (S.seal_text || '') + '</span></div>';
    form.parentNode.insertBefore(note, form);
  }
  var gal = document.querySelector('.gal-main');
  if(gal && !gal.querySelector('.pdp-xmas-seal')){
    var seal = document.createElement('div');
    seal.className = 'pdp-xmas-seal';
    seal.innerHTML = '<span><b>' + (S.seal_title || '') + '</b>' + (S.seal_text || '') + '</span>';
    gal.appendChild(seal);
  }

  var img = document.getElementById('galImg'), before = null;
  function sync(){
    var on = chip.classList.contains('active');
    document.body.classList.toggle('pdp-xmas-on', on);
    if(!img || !cfg.img) return;
    if(on){
      if(img.getAttribute('src') !== cfg.img){ before = img.getAttribute('src'); img.src = cfg.img; }
    } else if(before && img.getAttribute('src') === cfg.img){
      img.src = before;
    }
  }
  var group = chip.closest('.scent-opts');
  if(group) group.addEventListener('click', function(){ setTimeout(sync, 0); });
  document.querySelectorAll('.gal-thumb').forEach(function(t){
    t.addEventListener('click', function(){ before = null; });
  });

  /* Ohne ?variant= in der URL den Weihnachtsduft vorauswählen */
  if(!/[?&]variant=/.test(location.search) && !chip.classList.contains('active') && !chip.disabled){
    chip.click();
  }
  sync();
})();

