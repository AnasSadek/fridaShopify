(function(){
  "use strict";
  var $ = function(s,c){return (c||document).querySelector(s);};
  var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};
  var routes = window.fridaRoutes || {};
  var cartUrl = (routes.cart_url || '/cart');
  var cartAddUrl = (routes.cart_add_url || '/cart/add');
  var cartChangeUrl = (routes.cart_change_url || '/cart/change');
  var cfg = window.fridaSettings || {};
  var FREE_SHIP = typeof cfg.freeShip === 'number' ? cfg.freeShip : 5500; // in Cent, Theme-Editor-Einstellung
  var STR = window.fridaStrings || window.fridaCartStrings || {};

  function tr(key, fallback){
    return (STR && STR[key]) || fallback || '';
  }

  function format(str, vars){
    return String(str || '').replace(/{{\s*(\w+)\s*}}|%\{(\w+)\}/g, function(_, a, b){
      var k = a || b;
      return vars && vars[k] != null ? vars[k] : '';
    });
  }

  function money(cents){
    var m = window.fridaMoney || {};
    var cur = m.currency || 'EUR';
    try {
      return new Intl.NumberFormat(m.locale || document.documentElement.lang || 'de', { style: 'currency', currency: cur }).format(cents / 100);
    } catch (e) {
      return (cents / 100).toFixed(2).replace('.', ',') + ' ' + cur;
    }
  }

  /* ---------- AUTOMATISCHE RABATT-KAMPAGNEN (Anzeige) ----------
     Datenquelle: window.fridaPromos (Shop-Metafeld, serverseitig gerendert).
     Gleiche Regeln wie snippets/promo-info.liquid: Start/Ende, Land,
     Produkt-/Varianten-Bezug. Kampagnen mit Kollektions-Bezug können
     clientseitig nicht aufgelöst werden und werden hier übersprungen
     (serverseitig gerendert greifen sie trotzdem). Es werden nur
     Anzeigen berechnet – die echte Rabattierung macht immer Shopify. */
  function findPromo(productId, handle, variantId){
    var ctx = window.fridaPromoCtx || {};
    if(!ctx.enabled) return null;
    var list = window.fridaPromos || [];
    var now = Math.floor(Date.now() / 1000);
    var cur = (window.fridaMoney || {}).currency || 'EUR';
    for(var i = 0; i < list.length; i++){
      var c = list[i] || {};
      if((c.starts || 0) > now) continue;
      if((c.ends || 0) > 0 && c.ends < now) continue;
      if(c.countries && c.countries.length && c.countries.indexOf(ctx.country) < 0) continue;
      /* Produkt-Zuordnung über die numerische ID (sprachunabhängig);
         Handle nur als Fallback, da übersetzte Storefronts (z. B. /en/)
         übersetzte URL-Handles liefern. */
      var prodMatch = false;
      var pids = c.product_ids || [];
      if(productId != null){
        for(var k = 0; k < pids.length; k++){
          if(String(pids[k]) === String(productId)){ prodMatch = true; break; }
        }
      }
      var handles = c.product_handles || [];
      if(!prodMatch && handle && handles.indexOf(handle) >= 0) prodMatch = true;
      var mode = null;
      var vids = c.variant_ids || [];
      if(vids.length){
        if(prodMatch){
          mode = 'partial';
          if(variantId != null){
            mode = null;
            for(var j = 0; j < vids.length; j++){
              if(String(vids[j]) === String(variantId)){ mode = 'price'; break; }
            }
          }
        }
      } else if(c.all === true){
        mode = 'price';
      } else if(prodMatch){
        mode = 'price';
      }
      if(!mode) continue;
      if(mode === 'price'){
        if(c.conditional === true) mode = 'conditional';
        else if(c.kind === 'amount' && c.currency !== cur) mode = 'conditional';
        else if(!ctx.prices) mode = 'conditional';
      }
      return { mode: mode, title: c.title || '', kind: c.kind, value: c.value || 0 };
    }
    return null;
  }
  function promoPrice(baseCents, p){
    if(!p || p.mode !== 'price') return null;
    var out = p.kind === 'amount' ? baseCents - p.value : Math.round(baseCents * (100 - p.value) / 100);
    return out < 0 ? 0 : out;
  }
  function promoSaving(p){
    return p.kind === 'amount' ? money(p.value) : p.value + ' %';
  }
  function promoHint(p){
    return p.mode === 'partial'
      ? tr('promoSelectVariants', 'Für ausgewählte Varianten')
      : tr('promoInCart', 'Wird im Warenkorb automatisch abgezogen');
  }

  /* ---------- TOAST ---------- */
  var toastT;
  function toast(msg){
    var t = $('#toast'); if(!t) return;
    var tm = $('#toastMsg');
    if(tm) tm.textContent = msg || tr('added', 'Zum Warenkorb hinzugefügt');
    t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function(){t.classList.remove('show');},2000);
  }

  /* ---------- CART DRAWER ---------- */
  var drawer = $('#drawer'), overlay = $('#overlay');
  function openDrawer(){
    if(drawer) drawer.classList.add('open');
    if(overlay) overlay.classList.add('open');
  }
  function closeDrawer(){
    if(drawer) drawer.classList.remove('open');
    if(overlay) overlay.classList.remove('open');
  }

  function cartPropertiesHtml(properties){
    if(!properties) return '';
    var rows = Object.keys(properties).filter(function(key){
      var value = properties[key];
      return key && key.charAt(0) !== '_' && value != null && String(value).trim() !== '';
    }).map(function(key){
      return '<div class="ci-prop"><b>' + escHtml(key) + ':</b> <span>' + escHtml(properties[key]) + '</span></div>';
    });
    return rows.length ? '<div class="ci-props">' + rows.join('') + '</div>' : '';
  }

  function cartHasShippingIncluded(cart){
    if(!cart || !cart.items || !cart.items.length) return false;

    return cart.items.some(function(item){
      var props = item.properties || {};
      var handle = String(item.handle || '').toLowerCase();
      var title = String(item.product_title || '').toLowerCase();

      return String(props._shipping_included) === 'true' ||
        handle.indexOf('frida-mix-match-duftpaket') !== -1 ||
        handle.indexOf('mix-match') !== -1 ||
        title.indexOf('mix & match') !== -1 ||
        title.indexOf('mix and match') !== -1;
    });
  }

  function currentStoreLang() {
    var path = window.location.pathname || '';

    if (path === '/ar' || path.indexOf('/ar/') === 0) return 'ar';
    if (path === '/de' || path.indexOf('/de/') === 0) return 'de';
    if (path === '/en' || path.indexOf('/en/') === 0) return 'en';
    if (path === '/fr' || path.indexOf('/fr/') === 0) return 'fr';
    if (path === '/tr' || path.indexOf('/tr/') === 0) return 'tr';
    if (path === '/ru' || path.indexOf('/ru/') === 0) return 'ru';
    if (path === '/nl' || path.indexOf('/nl/') === 0) return 'nl';

    var lang = document.documentElement.getAttribute('lang') || '';

    if (!lang && window.Shopify && Shopify.locale) {
      lang = Shopify.locale;
    }

    lang = String(lang || '').toLowerCase();

    if (lang.indexOf('ar') === 0) return 'ar';
    if (lang.indexOf('de') === 0) return 'de';
    if (lang.indexOf('en') === 0) return 'en';
    if (lang.indexOf('fr') === 0) return 'fr';
    if (lang.indexOf('tr') === 0) return 'tr';
    if (lang.indexOf('ru') === 0) return 'ru';
    if (lang.indexOf('nl') === 0) return 'nl';

    return 'en';
  }

  function packageShippingActiveText() {
    var lang = currentStoreLang();

    if (lang === 'ar') {
      return '🎉 <b>الشحن المجاني</b> مفعّل لهذه الباقة.';
    }

    if (lang === 'de') {
      return '🎉 <b>Versandkostenfrei</b> ist für dieses Paket aktiv.';
    }

    if (lang === 'fr') {
      return '🎉 La <b>livraison gratuite</b> est active pour ce pack.';
    }

    if (lang === 'tr') {
      return '🎉 Bu paket için <b>ücretsiz kargo</b> aktif.';
    }

    if (lang === 'ru') {
      return '🎉 Для этого набора активна <b>бесплатная доставка</b>.';
    }

    if (lang === 'nl') {
      return '🎉 <b>Gratis verzending</b> is actief voor dit pakket.';
    }

    return '🎉 <b>Free shipping</b> is active for this package.';
  }

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
      body.innerHTML = '<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><p>'+tr('cartEmpty','Dein Warenkorb ist noch leer.')+'</p></div>';
      if(foot) foot.style.display='none'; return;
    }
    // body.innerHTML = cart.items.map(function(it,i){
    //   var line = i+1;
    //   //var vtitle = (it.variant_title && it.variant_title.indexOf('Default')<0) ? it.variant_title : '';
    //   var props = it.properties || {};
    //   var localizedTitle = props._localized_product_title || it.product_title;
    //   var localizedVariant = props._localized_variant_title || '';
    //   var vtitle = localizedVariant || ((it.variant_title && it.variant_title.indexOf('Default')<0) ? it.variant_title : '');
    //   return '<div class="ci">'
    //     + '<div class="ci-img"><img src="'+escHtml(it.image? it.image.replace(/(\.[a-z]+)(\?|$)/,'_120x$1$2') : '')+'" alt=""></div>'
    //     //+ '<div class="ci-info"><b>'+escHtml(it.product_title)+'</b><small>'+escHtml(vtitle)+'</small>'
    //     + '<div class="ci-info"><b>'+escHtml(localizedTitle)+'</b><small>'+escHtml(vtitle)+'</small>'
    //     + cartPropertiesHtml(it.properties)
    //     + '<div class="ci-bottom"><div class="qty">'
    //     + '<button data-line="'+line+'" data-qty="'+(it.quantity-1)+'">−</button><span>'+it.quantity+'</span>'
    //     + '<button data-line="'+line+'" data-qty="'+(it.quantity+1)+'">+</button></div>'
    //     + '<span class="ci-price">'+money(it.final_line_price)+'</span></div>'
    //     + '<button class="ci-remove" data-line="'+line+'" data-qty="0">'+tr('remove','Entfernen')+'</button></div></div>';
    // }).join('');
    body.innerHTML = cart.items.map(function(it,i){
      var line = i+1;
      var props = it.properties || {};
      var localizedTitle = props._localized_product_title || it.product_title;
      var localizedVariant = props._localized_variant_title || '';
      var vtitle = localizedVariant || ((it.variant_title && it.variant_title.indexOf('Default')<0) ? it.variant_title : '');

      var productUrl = it.url || (it.handle ? '/products/' + it.handle : '#');
      var prefix = getLocalePrefix();

      if (prefix && productUrl.indexOf(prefix + '/') !== 0 && productUrl.charAt(0) === '/') {
        productUrl = prefix + productUrl;
      }

      return '<div class="ci">'
        + '<a class="ci-img ci-link" href="' + escHtml(productUrl) + '" aria-label="' + escHtml(localizedTitle) + '">'
        + '<img src="' + escHtml(it.image ? it.image.replace(/(\.[a-z]+)(\?|$)/,'_120x$1$2') : '') + '" alt="' + escHtml(localizedTitle) + '">'
        + '</a>'
        + '<div class="ci-info">'
        + '<a class="ci-title ci-link" href="' + escHtml(productUrl) + '">' + escHtml(localizedTitle) + '</a>'
        + '<small>' + escHtml(vtitle) + '</small>'
        + cartPropertiesHtml(it.properties)
        + (function(){
            var allocs = it.line_level_discount_allocations || [];
            if(!allocs.length) return '';
            return '<div class="ci-discounts">' + allocs.map(function(d){
              var title = (d.discount_application && d.discount_application.title) || '';
              return '<span class="ci-discount" dir="auto">' + escHtml(title) + ' (−' + money(d.amount) + ')</span>';
            }).join('') + '</div>';
          })()
        + '<div class="ci-bottom"><div class="qty">'
        + '<button data-line="' + line + '" data-qty="' + (it.quantity - 1) + '">−</button><span>' + it.quantity + '</span>'
        + '<button data-line="' + line + '" data-qty="' + (it.quantity + 1) + '">+</button></div>'
        + '<span class="ci-price">'
        + (it.original_line_price > it.final_line_price ? '<s class="ci-price-old">' + money(it.original_line_price) + '</s> ' : '')
        + money(it.final_line_price) + '</span></div>'
        + '<button class="ci-remove" data-line="' + line + '" data-qty="0">' + tr('remove','Entfernen') + '</button></div></div>';
    }).join('');
    if(foot){
      foot.style.display='block';
      var subtotal = $('#subtotal');
      if(subtotal) subtotal.textContent = money(cart.total_price);
      var note = $('#shipNote');
      var prog = $('#shipProgress'), bar = $('#shipBar');
      var free = FREE_SHIP > 0;
      var shippingIncludedActive = cartHasShippingIncluded(cart);

      if(note){
        if(shippingIncludedActive){
          note.innerHTML = packageShippingActiveText();
        }
        else if(!free){ note.innerHTML=''; }
        else if(cart.total_price >= FREE_SHIP){ note.innerHTML = tr('freeShippingDone','🎉 Du erhältst <b>Gratis-Versand</b>!'); }
        else { note.innerHTML = format(tr('freeShippingRemaining','Nur noch <b>{{ amount }}</b> bis zum Gratis-Versand.'), {amount: money(FREE_SHIP-cart.total_price)}); }
      }
      if(prog && bar){
        prog.style.display = (free || shippingIncludedActive) ? '' : 'none';

        if(shippingIncludedActive){
          bar.style.width = '100%';
          prog.classList.add('done');
        }
        else if(free){
          var pct = Math.min(100, Math.round(cart.total_price / FREE_SHIP * 100));
          bar.style.width = pct + '%';
          prog.classList.toggle('done', pct >= 100);
        } else {
          bar.style.width = '0%';
          prog.classList.remove('done');
        }
      }
    }
    renderUpsell(cart);
  }

  /* ---------- CART UPSELL (Shopify product recommendations) ---------- */
  function getLocalePrefix() {
  var path = window.location.pathname || '';
  var match = path.match(/^\/(ar|de|en|fr|tr|ru|nl)(\/|$)/);
  return match ? '/' + match[1] : '';
}

function extractLocalizedProductTitle(html) {
  if (!html || typeof DOMParser === 'undefined') return '';

  var doc = new DOMParser().parseFromString(html, 'text/html');

  var titleEl =
    doc.querySelector('.pdp-title') ||
    doc.querySelector('[data-product-title]') ||
    doc.querySelector('h1');

  if (!titleEl) return '';

  return String(titleEl.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchLocalizedUpsellProduct(product) {
  if (!product || !product.handle) {
    return Promise.resolve(product);
  }

  var prefix = getLocalePrefix();

  if (!prefix) {
    return Promise.resolve(product);
  }

  var url = prefix + '/products/' + product.handle;

  return fetch(url, {
    headers: {
      'Accept': 'text/html'
    }
  })
  .then(function(r) {
    return r.ok ? r.text() : '';
  })
  .then(function(html) {
    var localizedTitle = extractLocalizedProductTitle(html);

    if (localizedTitle) {
      product.title = localizedTitle;
    }

    return product;
  })
  .catch(function() {
    return product;
  });
}


function isMixMatchProduct(product, fallbackHandle) {
  var handle = String((product && product.handle) || fallbackHandle || '').toLowerCase();
  var title = String((product && product.title) || '').toLowerCase();

  return handle.indexOf('mix-match') !== -1 ||
    handle.indexOf('duftpaket-7-dufte-selbst-wahlen') !== -1 ||
    title.indexOf('mix & match') !== -1 ||
    title.indexOf('mix and match') !== -1;
}

function renderUpsell(cart) {
  var box = $('#drawerUpsell');
  if (!box) return;

  if (!cart.items || !cart.items.length) {
    box.innerHTML = '';
    return;
  }

  var inCart = cart.items.map(function(it) {
    return it.product_id;
  });

  fetch('/recommendations/products.json?product_id=' + cart.items[0].product_id + '&limit=4')
    .then(function(r) {
      return r.ok ? r.json() : { products: [] };
    })
    .then(function(data) {
      var recs = (data.products || []).filter(function(p) {
        return inCart.indexOf(p.id) < 0 && p.available;
      }).slice(0, 2);

      if (!recs.length) {
        box.innerHTML = '';
        return;
      }

      return Promise.all(recs.map(fetchLocalizedUpsellProduct)).then(function(localizedRecs) {
        box.innerHTML = '<h4>' + tr('upsellTitle', 'Passt perfekt dazu') + '</h4>' + localizedRecs.map(function(p) {
          var v = p.variants && p.variants[0];
          var img = (p.featured_image || '').replace(/(\.[a-z]+)(\?|$)/, '_120x$1$2');

          var isMixMatch = isMixMatchProduct(p);
          var productLink = (getLocalePrefix() || '') + '/products/' + (p.handle || '');

          var upBase = v ? v.price : p.price;
          var upPromo = findPromo(p.id, p.handle, v ? v.id : null);
          var upPP = promoPrice(upBase, upPromo);
          return '<div class="up-item"><img src="' + escHtml(img) + '" alt="' + escHtml(p.title || '') + '" loading="lazy">'
            + '<div class="up-info"><b>' + escHtml(p.title || '') + '</b><small>'
            + (upPP != null ? money(upPP) + ' <s>' + money(upBase) + '</s>' : money(upBase))
            + '</small></div>'
            + (
                isMixMatch
                  ? '<a class="up-add" href="' + escHtml(productLink) + '">' + escHtml(tr('chooseScent', 'Düfte auswählen')) + '</a>'
                  : (v ? '<button class="up-add" data-upsell-id="' + v.id + '">' + tr('upsellAdd', '+ Hinzufügen') + '</button>' : '')
              )
            + '</div>';
        }).join('');
      });
    })
    .catch(function() {
      box.innerHTML = '';
    });
}

  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-upsell-id]');
    if(b){ b.disabled = true; addToCart(parseInt(b.getAttribute('data-upsell-id'),10), 1); }
  });

  function parseJsonResponse(r, action){
    if(!r.ok){
      return r.text().then(function(t){
        throw new Error(action + ' failed: ' + r.status + (t ? ' - ' + t.slice(0, 200) : ''));
      });
    }
    return r.json();
  }

  function fetchCart(){
    return fetch(cartUrl + '.js', {
      headers:{'Accept':'application/json'}
    })
    .then(function(r){ return parseJsonResponse(r, 'Cart fetch'); })
    .then(function(c){
      renderCart(c);
      return c;
    })
    .catch(function(err){
      console.error(err);
    });
  }

  function changeLine(line, qty){
    line = parseInt(line, 10);
    qty = parseInt(qty, 10);

    if(isNaN(line) || isNaN(qty)) return Promise.resolve();

    return fetch(cartChangeUrl + '.js', {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({line:line, quantity:Math.max(0, qty)})
    })
    .then(function(r){ return parseJsonResponse(r, 'Cart change'); })
    .then(renderCart)
    .catch(function(err){
      console.error(err);
    });
  }

  function addToCart(id, qty, properties){
    id = parseInt(id, 10);
    qty = parseInt(qty, 10) || 1;

    if(!id) return Promise.resolve();

    var item = {id:id, quantity:qty};
    if(properties && Object.keys(properties).length) item.properties = properties;

    return fetch(cartAddUrl + '.js', {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({items:[item]})
    })
    .then(function(r){ return parseJsonResponse(r, 'Cart add'); })
    .then(function(){
      return fetchCart().then(function(){
        toast();
        openDrawer();
      });
    })
    .catch(function(err){
      console.error(err);
      toast(tr('addError','Das Produkt konnte nicht hinzugefügt werden.'));
    });
  }

  function getCartPropertiesFromForm(form){
    var properties = {};
    if(!form) return properties;

    form.querySelectorAll('[name^="properties["]').forEach(function(field){
      if(field.disabled) return;
      if((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
      var match = field.name.match(/^properties\[(.+)\]$/);
      if(!match) return;
      var value = field.value == null ? '' : String(field.value).trim();
      if(value !== '') properties[match[1]] = value;
    });

    return properties;
  }

  function getShippingIncludedProperties(isIncluded){
    return isIncluded ? {_shipping_included: 'true'} : {};
  }

  // Add-to-cart forms (product cards + product page)
  document.addEventListener('submit', function(e){
    var form = e.target.closest('.frida-add-form');
    if(!form) return;
    e.preventDefault();
    var id = (form.querySelector('[name="id"]')||{}).value;
    var qEl = form.querySelector('[name="quantity"]');
    var q = qEl ? parseInt(qEl.value,10)||1 : 1;
    var properties = getCartPropertiesFromForm(form);

    if(id) addToCart(id,q,properties);
  });

  // Drawer qty controls
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-line]');
    if(b){
      e.preventDefault();
      changeLine(b.getAttribute('data-line'), b.getAttribute('data-qty'));
    }
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

      var localizedVariantTitle = $('#localizedVariantTitle');
      if(localizedVariantTitle && v.title){
        localizedVariantTitle.value = v.title;
      }

      var hasPromoPrice = v.promo_price != null;
      var price = $('#pPrice');
      if(price){
        price.textContent = money(hasPromoPrice ? v.promo_price : v.price);
        price.classList.toggle('price-promo', hasPromoPrice);
      }

      var was = $('#pWas'), off = $('#pOff');
      if(hasPromoPrice){
        if(was){ was.style.display=''; was.textContent = money(v.price); }
        if(off){ off.style.display=''; off.textContent = '−' + (v.promo_saving || ''); }
      } else if(v.compare_at_price && v.compare_at_price > v.price){
        if(was){ was.style.display=''; was.textContent = money(v.compare_at_price); }
        if(off){ off.style.display=''; off.textContent = '–' + Math.round((1 - v.price / v.compare_at_price) * 100) + ' %'; }
      } else {
        if(was) was.style.display='none';
        if(off) off.style.display='none';
      }

      var promoEl = $('#pPromo');
      if(promoEl){
        if(v.promo_mode){
          var promoExtra = hasPromoPrice
            ? format(tr('youSave', 'Du sparst {{ amount }}'), { amount: v.promo_saving || '' })
            : (v.promo_mode === 'partial'
                ? tr('promoSelectVariants', 'Für ausgewählte Varianten')
                : tr('promoInCart', 'Wird im Warenkorb automatisch abgezogen'));
          promoEl.innerHTML = '<b>' + escHtml(v.promo_title || '') + '</b> · ' + escHtml(promoExtra);
          promoEl.style.display = '';
        } else {
          promoEl.style.display = 'none';
        }
      }

      var sb = $('#sbPrice');
      if(sb){
        if(hasPromoPrice){
          sb.innerHTML = money(v.promo_price) + '<s>' + money(v.price) + '</s>';
        } else {
          sb.innerHTML = money(v.price) + (v.compare_at_price && v.compare_at_price > v.price ? '<s>' + money(v.compare_at_price) + '</s>' : '');
        }
      }

      var avail = $('#pAvail');
      if(avail) avail.textContent = v.available ? tr('inStock','Auf Lager') : tr('soldOut','Ausverkauft');

      var addBtn = $('#pAdd'), addLbl = $('#pAddLabel'), stickyAdd = $('#sbAdd');
      if(addBtn) addBtn.disabled = !v.available;
      if(stickyAdd) stickyAdd.disabled = !v.available;
      if(addLbl) addLbl.textContent = v.available ? tr('addToCart','In den Warenkorb') : tr('soldOut','Ausverkauft');
      if(stickyAdd) stickyAdd.textContent = v.available ? tr('addToCart','In den Warenkorb') : tr('soldOut','Ausverkauft');

      /* Change main image when the selected variant has an image */
      var imageUrl = null;
      var imageAlt = '';

      if(v.image){
        imageUrl = v.image;
        imageAlt = v.imageAlt || '';
      } else if(v.featured_image){
        if(typeof v.featured_image === 'string'){
          imageUrl = v.featured_image;
        } else if(v.featured_image.src){
          imageUrl = v.featured_image.src;
          imageAlt = v.featured_image.alt || '';
        }
      }

      if(imageUrl){
        var gi = $('#galImg');
        if(gi){
          gi.src = imageUrl;
          gi.alt = imageAlt || gi.alt || '';
        }

        var stickyImg = $('.sticky-prod img');
        if(stickyImg){
          stickyImg.src = imageUrl;
          stickyImg.alt = imageAlt || '';
        }

        $$('.gal-thumb').forEach(function(t){
          var thumbSrc = t.getAttribute('data-thumb-src');
          t.classList.toggle('active', thumbSrc === imageUrl);
        });
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
    if(qm && qVal) qm.addEventListener('click', function(){ var n=Math.max(1,(parseInt(qVal.value,10)||1)-1); qVal.value=n; });
    if(qp && qVal) qp.addEventListener('click', function(){ var n=(parseInt(qVal.value,10)||1)+1; qVal.value=n; });
    if(qVal) qVal.addEventListener('change', function(){ qVal.value = Math.max(1, parseInt(qVal.value,10)||1); });

    // Sticky add
    var sbAdd = $('#sbAdd');
    if(sbAdd) sbAdd.addEventListener('click', function(){
      var id = ($('#variantId')||{}).value; var q = qVal ? parseInt(qVal.value,10)||1 : 1;
      var productForm = $('#productForm');
      var properties = getCartPropertiesFromForm(productForm);
      if(id) addToCart(id,q,properties);
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

    updateVariant();
  }

  /* ---------- VIDEO ---------- */
  var playBtn = $('#playBtn');
  if(playBtn) playBtn.addEventListener('click', function(){
    var wrap = playBtn.closest('[data-video]');
    var url = wrap && wrap.getAttribute('data-video');
    if(url){ window.open(url,'_blank'); } else { toast(tr('videoComingSoon','Video folgt in Kürze ✨')); }
  });

  /* ---------- QUICK VIEW ---------- */
var qv = $('#quickView');

function closeQv(){
  if(qv) qv.classList.remove('open');
}

function escHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function qvOptionName(opt){
  if(typeof opt === 'string') return opt;
  if(opt && opt.name) return opt.name;
  return tr('option','Option');
}

function qvVariantImage(v, fallback){
  if(v && v.featured_image){
    if(typeof v.featured_image === 'string') return v.featured_image;
    if(v.featured_image.src) return v.featured_image.src;
  }

  if(v && v.image){
    if(typeof v.image === 'string') return v.image;
    if(v.image.src) return v.image.src;
  }

  return fallback || '';
}

function openQv(handle, productUrl, shippingIncluded){
  if(!qv) return;

  productUrl = productUrl || ('/products/' + handle);
  shippingIncluded = shippingIncluded === true || shippingIncluded === 'true';
  qv.setAttribute('data-shipping-included', shippingIncluded ? 'true' : 'false');

  fetch('/products/' + handle + '.js', {
    headers:{'Accept':'application/json'}
  })
  .then(function(r){
    if(!r.ok) throw new Error('Quick view failed: ' + r.status);
    return r.json();
  })
  .then(function(p){
    var isMixMatch = isMixMatchProduct(p, handle);

    if(isMixMatch){
      window.location.href = productUrl || ((getLocalePrefix() || '') + '/products/' + handle);
      return;
    }

    var baseImg = p.featured_image || (p.images && p.images[0]) || '';

    if(baseImg && typeof baseImg === 'object'){
      baseImg = baseImg.src || '';
    }

    // var variants = p.variants || [];
    // var v0 = variants[0] || {};
    // var firstImg = qvVariantImage(v0, baseImg);
    var allVariants = p.variants || [];

    var variants = allVariants.filter(function(v) {
      if (!v) return false;

      if (typeof v.inventory_quantity === 'number') {
        return v.inventory_quantity > 0;
      }

      return v.available === true;
    });

    var v0 = variants[0] || allVariants.find(function(v) {
      return v && v.available === true;
    }) || allVariants[0] || {};

    var firstImg = qvVariantImage(v0, baseImg);

    var desc = (p.description || '')
      .replace(/<[^>]*>/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);

    var optsHtml = '';

    if(variants.length > 1 && p.options && p.options.length === 1){
      var optLabel = qvOptionName(p.options[0]);

      optsHtml = '<div class="opt-label">' + escHtml(optLabel) + '</div><div class="scent-opts" id="qvOpts">'
        + variants.map(function(v,i){
            var vImg = qvVariantImage(v, baseImg);
            var title = v.public_title || v.title || v.option1 || (tr('option','Option') + ' ' + (i + 1));

            return '<button type="button"'
              + ' class="scent-opt' + (i === 0 ? ' active' : '') + '"'
              + ' data-qv-variant="' + escHtml(v.id) + '"'
              + ' data-qv-price="' + escHtml(v.price) + '"'
              + ' data-qv-image="' + escHtml(vImg) + '"'
              + ' data-qv-alt="' + escHtml((p.title || '') + ' - ' + title) + '"'
              + (v.available ? '' : ' disabled')
              + '>' + escHtml(title) + '</button>';
          }).join('')
        + '</div>';
    }

    qv.querySelector('.modal-card').innerHTML =
      '<button class="qv-close" data-qv-close aria-label="' + escHtml(tr('close','Schließen')) + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      + '</button>'

      + '<div class="qv-media">'
      + '<img id="qvImg" src="' + escHtml(firstImg) + '" alt="' + escHtml(p.title || '') + '">'
      + '</div>'

      + '<div class="qv-body">'
      + '<div class="card-cat">' + escHtml(p.type || tr('homeFragrance','Home Fragrance')) + '</div>'
      + '<h3>' + escHtml(p.title || '') + '</h3>'
      + '<div class="stars"><span class="s">★★★★★</span> 4,9</div>'
      + (desc ? '<p class="qv-desc">' + escHtml(desc) + '…</p>' : '')
      + optsHtml
      + '<div class="qv-price" id="qvPrice">' + qvPriceHtml(p.id, p.handle, v0.id, v0.price || p.price || 0) + '</div>'
      + '<input type="hidden" id="qvVariantId" value="' + escHtml(v0.id || '') + '">'

      + '<button class="add-btn" id="qvAdd" ' + (v0.available ? '' : 'disabled') + '>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
      + (v0.available ? tr('addToCart','In den Warenkorb') : tr('soldOut','Ausverkauft'))
      + '</button>'

      + '<a class="qv-link" href="' + escHtml(productUrl) + '">' + escHtml(tr('allDetails','Alle Details ansehen →')) + '</a>'
      + '</div>';

    qv.setAttribute('data-qv-handle', p.handle || '');
    qv.setAttribute('data-qv-pid', p.id || '');
    qv.classList.add('open');
  })
  .catch(function(){
    window.location.href = productUrl;
  });
}

/* Preis-HTML im Quick View: Aktionspreis + Original durchgestrichen + Kampagne */
function qvPriceHtml(productId, handle, variantId, baseCents){
  var p = findPromo(productId, handle, variantId);
  var pp = promoPrice(baseCents, p);
  if(pp != null){
    return money(pp) + ' <s>' + money(baseCents) + '</s>'
      + '<small class="qv-promo" dir="auto">' + escHtml(p.title) + ' · '
      + escHtml(format(tr('youSave', 'Du sparst {{ amount }}'), { amount: promoSaving(p) })) + '</small>';
  }
  var html = money(baseCents);
  if(p){
    html += '<small class="qv-promo" dir="auto">' + escHtml(p.title) + ' · ' + escHtml(promoHint(p)) + '</small>';
  }
  return html;
}

document.addEventListener('click', function(e){
  var t = e.target.closest('[data-quick-view]');

  if(t){
    e.preventDefault();

    var handle = t.getAttribute('data-quick-view');
    var productUrl = t.getAttribute('data-product-url') || ('/products/' + handle);
    var shippingIncluded = t.getAttribute('data-shipping-included') === 'true';

    openQv(handle, productUrl, shippingIncluded);
    return;
  }

  if(e.target.closest('[data-qv-close]') || e.target.classList.contains('modal-bg')){
    closeQv();
    return;
  }

  var opt = e.target.closest('[data-qv-variant]');

  if(opt){
    $$('#qvOpts .scent-opt').forEach(function(b){
      b.classList.remove('active');
    });

    opt.classList.add('active');

    var idEl = $('#qvVariantId');
    if(idEl) idEl.value = opt.getAttribute('data-qv-variant');

    var priceEl = $('#qvPrice');
    if(priceEl){
      var qvHandle = (qv && qv.getAttribute('data-qv-handle')) || '';
      var qvPid = (qv && qv.getAttribute('data-qv-pid')) || null;
      priceEl.innerHTML = qvPriceHtml(
        qvPid,
        qvHandle,
        opt.getAttribute('data-qv-variant'),
        parseInt(opt.getAttribute('data-qv-price'), 10) || 0
      );
    }

    var imgEl = $('#qvImg');
    var newImg = opt.getAttribute('data-qv-image');

    if(imgEl && newImg){
      imgEl.src = newImg;
      imgEl.alt = opt.getAttribute('data-qv-alt') || '';
    }

    var addBtn = $('#qvAdd');
    if(addBtn){
      addBtn.disabled = opt.disabled;
    }

    return;
  }

  if(e.target.closest('#qvAdd')){
    var id = ($('#qvVariantId') || {}).value;
    var properties = getShippingIncludedProperties(qv && qv.getAttribute('data-shipping-included') === 'true');

    if(id){
      closeQv();
      addToCart(parseInt(id,10), 1, properties);
    }
  }
});

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeQv();
});

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