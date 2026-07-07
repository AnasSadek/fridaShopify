(function(){
  "use strict";
  var $ = function(s,c){return (c||document).querySelector(s);};
  var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};
  var routes = window.fridaRoutes || {};
  var cartUrl = (routes.cart_url || '/cart');
  var cfg = window.fridaSettings || {};
  var FREE_SHIP = typeof cfg.freeShip === 'number' ? cfg.freeShip : 3900; // in Cent, Theme-Editor-Einstellung

  function money(cents){
    return (cents/100).toFixed(2).replace('.',',') + ' €';
  }

  /* ---------- TOAST ---------- */
  var toastT;
  function toast(msg){
    var t = $('#toast'); if(!t) return;
    if(msg) $('#toastMsg').textContent = msg;
    t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function(){t.classList.remove('show');},2000);
  }

  /* ---------- CART DRAWER ---------- */
  var drawer = $('#drawer'), overlay = $('#overlay');
  function openDrawer(){ if(drawer){drawer.classList.add('open'); overlay.classList.add('open');} }
  function closeDrawer(){ if(drawer){drawer.classList.remove('open'); overlay.classList.remove('open');} }

  function renderCart(cart){
    var cc = $('#cartCount');
    if(cc){
      var changed = cc.textContent !== String(cart.item_count);
      cc.textContent = cart.item_count; cc.classList.toggle('show', cart.item_count>0);
      if(changed && cart.item_count>0){ cc.classList.remove('pop'); void cc.offsetWidth; cc.classList.add('pop'); }
    }
    var body = $('#drawerBody'), foot = $('#drawerFoot');
    if(!body) return;
    if(!cart.items || !cart.items.length){
      body.innerHTML = '<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><p>Dein Warenkorb ist noch leer.</p></div>';
      if(foot) foot.style.display='none'; return;
    }
    body.innerHTML = cart.items.map(function(it,i){
      var line = i+1;
      var vtitle = (it.variant_title && it.variant_title.indexOf('Default')<0) ? it.variant_title : '';
      return '<div class="ci">'
        + '<div class="ci-img"><img src="'+(it.image? it.image.replace(/(\.[a-z]+)(\?|$)/,'_120x$1$2') : '')+'" alt=""></div>'
        + '<div class="ci-info"><b>'+it.product_title+'</b><small>'+vtitle+'</small>'
        + '<div class="ci-bottom"><div class="qty">'
        + '<button data-line="'+line+'" data-qty="'+(it.quantity-1)+'">−</button><span>'+it.quantity+'</span>'
        + '<button data-line="'+line+'" data-qty="'+(it.quantity+1)+'">+</button></div>'
        + '<span class="ci-price">'+money(it.final_line_price)+'</span></div>'
        + '<button class="ci-remove" data-line="'+line+'" data-qty="0">Entfernen</button></div></div>';
    }).join('');
    if(foot){
      foot.style.display='block';
      $('#subtotal').textContent = money(cart.total_price);
      var note = $('#shipNote');
      var prog = $('#shipProgress'), bar = $('#shipBar');
      var free = FREE_SHIP > 0;
      if(note){
        if(!free){ note.innerHTML=''; }
        else if(cart.total_price >= FREE_SHIP){ note.innerHTML='🎉 Du erhältst <b>Gratis-Versand</b>!'; }
        else { note.innerHTML='Nur noch <b>'+money(FREE_SHIP-cart.total_price)+'</b> bis zum Gratis-Versand.'; }
      }
      if(prog && bar){
        prog.style.display = free ? '' : 'none';
        if(free){
          var pct = Math.min(100, Math.round(cart.total_price / FREE_SHIP * 100));
          bar.style.width = pct + '%';
          prog.classList.toggle('done', pct >= 100);
        }
      }
    }
    renderUpsell(cart);
  }

  /* ---------- CART UPSELL (Shopify product recommendations) ---------- */
  function renderUpsell(cart){
    var box = $('#drawerUpsell');
    if(!box) return;
    if(!cart.items || !cart.items.length){ box.innerHTML=''; return; }
    var inCart = cart.items.map(function(it){ return it.product_id; });
    fetch('/recommendations/products.json?product_id=' + cart.items[0].product_id + '&limit=4')
      .then(function(r){ return r.ok ? r.json() : {products:[]}; })
      .then(function(data){
        var recs = (data.products||[]).filter(function(p){ return inCart.indexOf(p.id)<0 && p.available; }).slice(0,2);
        if(!recs.length){ box.innerHTML=''; return; }
        box.innerHTML = '<h4>Passt perfekt dazu</h4>' + recs.map(function(p){
          var v = p.variants && p.variants[0];
          var img = (p.featured_image||'').replace(/(\.[a-z]+)(\?|$)/,'_120x$1$2');
          return '<div class="up-item"><img src="'+img+'" alt="'+(p.title||'').replace(/"/g,'&quot;')+'" loading="lazy">'
            + '<div class="up-info"><b>'+p.title+'</b><small>'+money(v ? v.price : p.price)+'</small></div>'
            + (v ? '<button class="up-add" data-upsell-id="'+v.id+'">+ Hinzufügen</button>' : '')
            + '</div>';
        }).join('');
      })
      .catch(function(){ box.innerHTML=''; });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-upsell-id]');
    if(b){ b.disabled = true; addToCart(parseInt(b.getAttribute('data-upsell-id'),10), 1); }
  });

  function fetchCart(){
    return fetch(cartUrl+'.js',{headers:{'Accept':'application/json'}}).then(function(r){return r.json();}).then(function(c){renderCart(c);return c;});
  }
  function changeLine(line, qty){
    fetch(routes.cart_change_url+'.js',{
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({line:line, quantity:qty})
    }).then(function(r){return r.json();}).then(renderCart);
  }
  function addToCart(id, qty){
    return fetch((routes.cart_add_url||'/cart/add')+'.js',{
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({items:[{id:id, quantity:qty||1}]})
    }).then(function(r){return r.json();}).then(function(){
      return fetchCart().then(function(){ toast(); openDrawer(); });
    });
  }

  // Add-to-cart forms (product cards + product page)
  document.addEventListener('submit', function(e){
    var form = e.target.closest('.frida-add-form');
    if(!form) return;
    e.preventDefault();
    var id = (form.querySelector('[name="id"]')||{}).value;
    var qEl = form.querySelector('[name="quantity"]');
    var q = qEl ? parseInt(qEl.value,10)||1 : 1;
    if(id) addToCart(id,q);
  });

  // Drawer qty controls
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-line]');
    if(b){ changeLine(parseInt(b.getAttribute('data-line'),10), parseInt(b.getAttribute('data-qty'),10)); }
  });

  var cartBtn = $('#cartBtn');
  if(cartBtn) cartBtn.addEventListener('click', function(e){ e.preventDefault(); openDrawer(); });
  var dc = $('#drawerClose'); if(dc) dc.addEventListener('click', closeDrawer);
  if(overlay) overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeDrawer(); });

  /* ---------- HEADER SCROLL ---------- */
  var header = $('#header');
  if(header) window.addEventListener('scroll', function(){ header.classList.toggle('scrolled', window.scrollY>10); });

  /* ---------- MOBILE NAV ---------- */
  var burger = $('#burger');
  if(burger) burger.addEventListener('click', function(){
    var nl = $('.nav-links'); if(!nl) return;
    var open = nl.style.display==='flex';
    nl.style.cssText = open ? '' : 'display:flex;position:absolute;top:70px;left:0;right:0;background:#fff;flex-direction:column;padding:16px 22px;gap:14px;box-shadow:var(--shadow);border-top:1px solid var(--line)';
  });

  /* ---------- PRODUCT PAGE ---------- */
  var productJsonEl = $('#ProductJson');
  if(productJsonEl){
    var variants = [];
    try{ variants = JSON.parse(productJsonEl.textContent); }catch(e){}
    var selected = [];
    $$('.scent-opts[data-option-index]').forEach(function(group){
      var idx = parseInt(group.getAttribute('data-option-index'),10);
      var act = group.querySelector('.scent-opt.active');
      selected[idx] = act ? act.getAttribute('data-value') : null;
    });

    function currentVariant(){
      return variants.find(function(v){
        return selected.every(function(val,i){ return val==null || v.options[i]===val; });
      });
    }
    function updateVariant(){
      var v = currentVariant(); if(!v) return;
      var idEl = $('#variantId'); if(idEl) idEl.value = v.id;
      var price = $('#pPrice'); if(price) price.textContent = money(v.price);
      var was = $('#pWas'), off = $('#pOff');
      if(v.compare_at_price && v.compare_at_price>v.price){
        if(was){ was.style.display=''; was.textContent = money(v.compare_at_price); }
        if(off){ off.style.display=''; off.textContent = '–'+Math.round((1-v.price/v.compare_at_price)*100)+' %'; }
      } else { if(was) was.style.display='none'; if(off) off.style.display='none'; }
      var sb = $('#sbPrice'); if(sb) sb.innerHTML = money(v.price) + (v.compare_at_price&&v.compare_at_price>v.price ? '<s>'+money(v.compare_at_price)+'</s>' : '');
      var avail = $('#pAvail'); if(avail) avail.textContent = v.available ? 'Auf Lager' : 'Ausverkauft';
      var addBtn = $('#pAdd'), addLbl = $('#pAddLabel');
      if(addBtn){ addBtn.disabled = !v.available; }
      if(addLbl){ addLbl.textContent = v.available ? 'In den Warenkorb' : 'Ausverkauft'; }
      if(v.featured_image && v.featured_image.src){
        var gi = $('#galImg'); if(gi) gi.src = v.featured_image.src;
      }
    }

    $$('.scent-opts[data-option-index]').forEach(function(group){
      var idx = parseInt(group.getAttribute('data-option-index'),10);
      group.addEventListener('click', function(e){
        var btn = e.target.closest('[data-option-value]'); if(!btn) return;
        group.querySelectorAll('.scent-opt').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        selected[idx] = btn.getAttribute('data-value');
        var disp = $('[data-opt-display="'+idx+'"]'); if(disp) disp.textContent = selected[idx];
        updateVariant();
      });
    });

    // Gallery thumbs
    $$('.gal-thumb').forEach(function(t){
      t.addEventListener('click', function(){
        var src = t.getAttribute('data-thumb-src'); var gi = $('#galImg');
        if(src && gi) gi.src = src;
        $$('.gal-thumb').forEach(function(x){x.classList.remove('active');});
        t.classList.add('active');
      });
    });

    // Qty box
    var qVal = $('#qVal');
    var qm = $('#qMinus'), qp = $('#qPlus');
    if(qm) qm.addEventListener('click', function(){ var n=Math.max(1,(parseInt(qVal.value,10)||1)-1); qVal.value=n; });
    if(qp) qp.addEventListener('click', function(){ var n=(parseInt(qVal.value,10)||1)+1; qVal.value=n; });

    // Sticky add
    var sbAdd = $('#sbAdd');
    if(sbAdd) sbAdd.addEventListener('click', function(){
      var id = ($('#variantId')||{}).value; var q = parseInt((qVal||{}).value,10)||1;
      if(id) addToCart(id,q);
    });

    // Sticky bar visibility
    var stickyBar = $('#stickyBar');
    var buyRow = $('.buy-row');
    var relSec = $('#related');
    if(stickyBar && buyRow){
      window.addEventListener('scroll', function(){
        var r = buyRow.getBoundingClientRect();
        var relTop = relSec ? relSec.getBoundingClientRect().top : 99999;
        stickyBar.classList.toggle('show', r.bottom<0 && relTop>200);
      });
    }

    // Detail tabs
    $$('.detail-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        $$('.detail-tab').forEach(function(t){t.classList.remove('active');});
        $$('.tab-panel').forEach(function(p){p.classList.remove('active');});
        tab.classList.add('active');
        var panel = $('.tab-panel[data-panel="'+tab.getAttribute('data-tab')+'"]');
        if(panel) panel.classList.add('active');
      });
    });
  }

  /* ---------- VIDEO ---------- */
  var playBtn = $('#playBtn');
  if(playBtn) playBtn.addEventListener('click', function(){
    var wrap = playBtn.closest('[data-video]');
    var url = wrap && wrap.getAttribute('data-video');
    if(url){ window.open(url,'_blank'); } else { toast('Video folgt in Kürze ✨'); }
  });

  /* ---------- QUICK VIEW ---------- */
  var qv = $('#quickView');
  function closeQv(){ if(qv) qv.classList.remove('open'); }
  function openQv(handle){
    if(!qv) return;
    fetch('/products/' + handle + '.js', {headers:{'Accept':'application/json'}})
      .then(function(r){ return r.json(); })
      .then(function(p){
        var img = p.featured_image || (p.images && p.images[0]) || '';
        var v0 = p.variants[0];
        var desc = (p.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
        var optsHtml = '';
        if(p.variants.length > 1 && p.options && p.options.length === 1){
          optsHtml = '<div class="opt-label">' + p.options[0] + '</div><div class="scent-opts" id="qvOpts">'
            + p.variants.map(function(v,i){
                return '<button type="button" class="scent-opt'+(i===0?' active':'')+'" data-qv-variant="'+v.id+'" data-qv-price="'+v.price+'" '+(v.available?'':'disabled')+'>'+v.title+'</button>';
              }).join('')
            + '</div>';
        }
        qv.querySelector('.modal-card').innerHTML =
          '<button class="qv-close" data-qv-close aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
          + '<div class="qv-media"><img src="'+img+'" alt="'+(p.title||'').replace(/"/g,'&quot;')+'"></div>'
          + '<div class="qv-body">'
          + '<div class="card-cat">'+(p.type || 'Home Fragrance')+'</div>'
          + '<h3>'+p.title+'</h3>'
          + '<div class="stars"><span class="s">★★★★★</span> 4,9</div>'
          + (desc ? '<p class="qv-desc">'+desc+'…</p>' : '')
          + optsHtml
          + '<div class="qv-price" id="qvPrice">'+money(v0.price)+'</div>'
          + '<input type="hidden" id="qvVariantId" value="'+v0.id+'">'
          + '<button class="add-btn" id="qvAdd" '+(v0.available?'':'disabled')+'>'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
          + (v0.available ? 'In den Warenkorb' : 'Ausverkauft') + '</button>'
          + '<a class="qv-link" href="'+p.url+'">Alle Details ansehen →</a>'
          + '</div>';
        qv.classList.add('open');
      })
      .catch(function(){ window.location.href = '/products/' + handle; });
  }
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-quick-view]');
    if(t){ e.preventDefault(); openQv(t.getAttribute('data-quick-view')); return; }
    if(e.target.closest('[data-qv-close]') || e.target.classList.contains('modal-bg')){ closeQv(); return; }
    var opt = e.target.closest('[data-qv-variant]');
    if(opt){
      $$('#qvOpts .scent-opt').forEach(function(b){ b.classList.remove('active'); });
      opt.classList.add('active');
      var idEl = $('#qvVariantId'); if(idEl) idEl.value = opt.getAttribute('data-qv-variant');
      var priceEl = $('#qvPrice'); if(priceEl) priceEl.textContent = money(parseInt(opt.getAttribute('data-qv-price'),10));
      return;
    }
    if(e.target.closest('#qvAdd')){
      var id = ($('#qvVariantId')||{}).value;
      if(id){ closeQv(); addToCart(parseInt(id,10), 1); }
    }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeQv(); });

  /* ---------- HOMEPAGE MOBILE STICKY CTA ---------- */
  var homeSticky = $('#homeSticky');
  if(homeSticky){
    var hero = $('.hero');
    window.addEventListener('scroll', function(){
      var past = hero ? hero.getBoundingClientRect().bottom < 0 : window.scrollY > 500;
      var nearEnd = (window.innerHeight + window.scrollY) > (document.body.scrollHeight - 900);
      homeSticky.classList.toggle('show', past && !nearEnd);
    }, {passive:true});
  }

  /* ---------- REVEAL ON SCROLL ---------- */
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
    },{threshold:.12});
    $$('.reveal').forEach(function(el){io.observe(el);});
  } else {
    $$('.reveal').forEach(function(el){el.classList.add('in');});
  }

  /* ---------- INIT ---------- */
  fetchCart();
})();
