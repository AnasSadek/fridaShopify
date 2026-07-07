(function(){
  "use strict";
  var $ = function(s,c){return (c||document).querySelector(s);};
  var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};
  var routes = window.fridaRoutes || {};
  var cartUrl = (routes.cart_url || '/cart');
  var FREE_SHIP = 3900; // 39,00 €

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
    if(cc){ cc.textContent = cart.item_count; cc.classList.toggle('show', cart.item_count>0); }
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
      if(note){
        if(cart.total_price >= FREE_SHIP){ note.innerHTML='🎉 Du erhältst <b>Gratis-Versand</b>!'; }
        else { note.innerHTML='Nur noch <b>'+money(FREE_SHIP-cart.total_price)+'</b> bis zum Gratis-Versand.'; }
      }
    }
  }

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
