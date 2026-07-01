/* Frida EU — global interactions: mobile nav, cart, quick view, sticky ATC, accordion */
(function () {
  'use strict';

  /* Mobile navigation */
  var menuToggle = document.querySelector('[data-menu-toggle]');
  var mobileNav = document.querySelector('[data-mobile-nav]');
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', function () {
      mobileNav.classList.add('is-open');
      mobileNav.setAttribute('aria-hidden', 'false');
    });
    mobileNav.querySelectorAll('[data-mobile-nav-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mobileNav.classList.remove('is-open');
        mobileNav.setAttribute('aria-hidden', 'true');
      });
    });
  }

  /* FAQ accordion */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var trigger = item.querySelector('.faq-item__q');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      item.closest('.faq-list').querySelectorAll('.faq-item.is-open').forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove('is-open');
          openItem.querySelector('.faq-item__q').setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('is-open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  /* Product tabs */
  document.querySelectorAll('.product-tabs').forEach(function (tabs) {
    var buttons = tabs.querySelectorAll('.product-tabs__btn');
    var panels = tabs.querySelectorAll('.product-tabs__panel');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        panels.forEach(function (p) { p.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var target = tabs.querySelector('#' + btn.getAttribute('data-tab-target'));
        if (target) target.classList.add('is-active');
      });
    });
  });

  /* Product gallery thumbnails */
  document.querySelectorAll('.product-gallery__thumbs').forEach(function (thumbs) {
    var mainImage = document.getElementById('ProductMainImage');
    thumbs.querySelectorAll('[data-gallery-thumb]').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        thumbs.querySelectorAll('[data-gallery-thumb]').forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
        if (mainImage) mainImage.src = thumb.getAttribute('data-full-src');
      });
    });
  });

  /* Variant swatches (visual selection, syncs hidden variant id input) */
  document.querySelectorAll('[data-variant-picker]').forEach(function (picker) {
    var input = picker.closest('form').querySelector('[data-variant-id-input]');
    picker.querySelectorAll('.variant-swatch').forEach(function (swatch) {
      swatch.addEventListener('click', function (e) {
        e.preventDefault();
        picker.querySelectorAll('.variant-swatch').forEach(function (s) { s.classList.remove('is-selected'); });
        swatch.classList.add('is-selected');
        if (input) input.value = swatch.getAttribute('data-variant-id');
      });
    });
  });

  /* Quantity input */
  document.querySelectorAll('.qty-input').forEach(function (qty) {
    var input = qty.querySelector('input');
    qty.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-step'), 10) || 1;
        var value = Math.max(1, (parseInt(input.value, 10) || 1) + step);
        input.value = value;
      });
    });
  });

  /* Sticky add-to-cart on product pages */
  var stickyAtc = document.querySelector('[data-sticky-atc]');
  var mainAtc = document.querySelector('[data-main-atc]');
  if (stickyAtc && mainAtc) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        stickyAtc.classList.toggle('is-visible', !entry.isIntersecting);
      });
    }, { threshold: 0 });
    observer.observe(mainAtc);

    stickyAtc.querySelector('[data-sticky-atc-submit]').addEventListener('click', function () {
      mainAtc.click();
      mainAtc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* Add to cart via AJAX (product cards + product page forms) */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-add-to-cart-form]')) return;
    e.preventDefault();
    var formData = new FormData(form);
    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.originalText = submitBtn.textContent; submitBtn.textContent = '...'; }

    fetch('/cart/add.js', {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' }
    })
      .then(function (res) { return res.json(); })
      .then(function () { return fetch('/cart.js'); })
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = cart.item_count;
        });
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
      })
      .catch(function (err) { console.error('Frida EU: Warenkorb konnte nicht aktualisiert werden.', err); })
      .finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText; }
      });
  });

  /* Quick View */
  var qvRoot = document.getElementById('quick-view-root');
  var qvContent = qvRoot ? qvRoot.querySelector('[data-quick-view-content]') : null;

  function closeQuickView() {
    if (!qvRoot) return;
    qvRoot.hidden = true;
    qvRoot.setAttribute('aria-hidden', 'true');
  }

  function renderQuickView(product) {
    var variant = product.variants[0];
    var image = product.featured_image ? product.featured_image : (product.images[0] || null);
    qvContent.innerHTML =
      '<div class="qv-grid">' +
        '<div>' + (image ? '<img src="' + image + '&width=700" alt="' + escapeHtml(product.title) + '" loading="lazy">' : '') + '</div>' +
        '<div>' +
          '<p class="product-card__vendor">' + escapeHtml(product.vendor || 'Frida EU') + '</p>' +
          '<h3>' + escapeHtml(product.title) + '</h3>' +
          '<p class="price">' + formatMoney(variant.price) + '</p>' +
          '<p>' + (product.description ? product.description.replace(/<[^>]*>/g, '').slice(0, 220) : '') + '&hellip;</p>' +
          '<form data-add-to-cart-form action="/cart/add" method="post">' +
            '<input type="hidden" name="id" value="' + variant.id + '">' +
            '<button type="submit" class="btn btn--primary btn--full">In den Warenkorb</button>' +
          '</form>' +
          '<a class="btn btn--outline btn--full" style="margin-top:10px" href="' + product.url + '">Details ansehen</a>' +
        '</div>' +
      '</div>';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatMoney(cents) {
    return (cents / 100).toFixed(2).replace('.', ',') + ' &euro;';
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-quick-view-trigger]');
    if (trigger && qvRoot) {
      e.preventDefault();
      var handle = trigger.getAttribute('data-product-handle');
      fetch('/products/' + handle + '.js')
        .then(function (res) { return res.json(); })
        .then(function (product) {
          renderQuickView(product);
          qvRoot.hidden = false;
          qvRoot.setAttribute('aria-hidden', 'false');
        });
      return;
    }
    if (e.target.closest('[data-quick-view-close]')) {
      closeQuickView();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeQuickView();
  });

  /* Video section: play button starts the uploaded lifestyle video with sound */
  document.querySelectorAll('[data-video-play]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrapper = btn.closest('.video-section__media');
      var video = wrapper.querySelector('video');
      if (!video) return;
      video.muted = false;
      video.controls = true;
      video.play();
      btn.hidden = true;
    });
  });

  /* Product recommendations (fetches server-rendered section via Shopify's recommendations endpoint) */
  document.querySelectorAll('[data-product-recommendations]').forEach(function (section) {
    var url = section.getAttribute('data-url');
    var target = section.querySelector('[data-product-recommendations-target]');
    if (!url || !target) return;
    fetch(url)
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var newTarget = doc.querySelector('[data-product-recommendations-target]');
        if (newTarget && newTarget.innerHTML.trim() !== '') {
          target.innerHTML = newTarget.innerHTML;
        } else {
          section.hidden = true;
        }
      })
      .catch(function () { section.hidden = true; });
  });

  /* Newsletter form (footer) */
  document.querySelectorAll('[data-newsletter-form]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var msg = form.querySelector('[data-newsletter-success]');
      if (msg) { setTimeout(function () { msg.hidden = false; }, 300); }
    });
  });
})();
