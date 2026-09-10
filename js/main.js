/* Avenix Overseas — shared public UI
 * One navigation, one Lara chat, one contact-form handler, shared accessibility.
 */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const setBodyLock = (locked, className = 'overlay-open') => {
    document.body.classList.toggle(className, locked);
  };

  function initHeroSlider() {
    const root = $('.hero, .page-hero');
    const slides = $$('.hero-slide');
    const dots = $('.hero-dots');
    if (!root || slides.length < 1) return;
    let index = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
    let timer = null;

    const render = next => {
      slides[index]?.classList.remove('active');
      dots?.querySelectorAll('button')[index]?.classList.remove('active');
      index = (next + slides.length) % slides.length;
      slides[index]?.classList.add('active');
      dots?.querySelectorAll('button')[index]?.classList.add('active');
    };

    if (dots && !dots.children.length && slides.length > 1) {
      slides.forEach((_, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', `Show slide ${i + 1}`);
        button.addEventListener('click', () => render(i));
        dots.appendChild(button);
      });
      dots.querySelectorAll('button')[index]?.classList.add('active');
    }

    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const start = () => {
      if (slides.length < 2 || timer) return;
      timer = setInterval(() => render(index + 1), 3500);
    };
    start();
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  }

  function initMobileNav() {
    const menu = $('#menu');
    const nav = $('#nav');
    if (!menu || !nav) return;
    let previousOverflow = '';

    const isMobile = () => window.matchMedia('(max-width: 980px)').matches;
    const setOpen = open => {
      const shouldOpen = Boolean(open && isMobile());
      if (shouldOpen) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = previousOverflow;
      }
      nav.classList.toggle('open', shouldOpen);
      menu.setAttribute('aria-expanded', String(shouldOpen));
      menu.setAttribute('aria-label', shouldOpen ? 'Close menu' : 'Open menu');
      const icon = $('i', menu);
      icon?.classList.toggle('fa-bars', !shouldOpen);
      icon?.classList.toggle('fa-xmark', shouldOpen);
      menu.setAttribute('aria-controls', 'nav');
    };

    setOpen(false);
    menu.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', e => { if (isMobile() && e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', e => {
      if (isMobile() && nav.classList.contains('open') && !nav.contains(e.target) && !menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false); });
    window.addEventListener('resize', () => { if (!isMobile()) setOpen(false); }, { passive: true });
  }

  function initHeaderScroll() {
    const header = $('.header');
    if (!header) return;
    const update = () => header.classList.toggle('scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function initContactForms() {
    const formId = '53t1pftz4qh';
    $$('form[data-contact-form]').forEach(form => {
      const phone = $('input[data-phone], input[type="tel"]', form);
      if (phone) {
        phone.inputMode = 'numeric';
        phone.maxLength = 10;
        phone.minLength = 10;
        phone.pattern = '\\d{10}';
        phone.addEventListener('input', () => { phone.value = phone.value.replace(/\D/g, '').slice(0, 10); });
      }

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const status = $('.form-status', form) || (() => { const el = document.createElement('div'); el.className = 'form-status'; form.appendChild(el); return el; })();
        const button = $('button[type="submit"], input[type="submit"]', form);
        status.className = 'form-status';
        status.textContent = 'Sending…';
        if (button) button.disabled = true;
        try {
          if (phone && phone.value.replace(/\D/g, '').length !== 10) throw new Error('Please enter exactly 10 digits for the phone number.');
          const email = $('input[type="email"]', form);
          if (email) email.name = 'fi-sender-email';
          if (!window.Forminit) throw new Error('The enquiry service is temporarily unavailable. Please try again.');
          const result = await new Forminit().submit(formId, new FormData(form));
          if (result?.error) throw new Error(result.error.message || 'Submission failed.');
          window.location.href = form.dataset.thankYou || 'thank-you.html';
        } catch (error) {
          status.textContent = error?.message || 'We could not send your enquiry. Please try again.';
          status.classList.add('error');
          if (button) button.disabled = false;
        }
      });
    });
  }

  function initLightbox() {
    if ($('#imgLightbox')) return;
    const box = document.createElement('div');
    box.id = 'imgLightbox';
    box.className = 'img-lightbox';
    box.hidden = true;
    box.innerHTML = `<div class="img-lightbox-bg" data-lb-close></div><div class="img-lightbox-panel" role="dialog" aria-modal="true" aria-label="Image preview"><button type="button" class="img-lightbox-close" data-lb-close aria-label="Close image preview">&times;</button><img id="imgLightboxSrc" alt="Full size preview"></div>`;
    document.body.appendChild(box);

    const close = () => { box.hidden = true; setBodyLock(false, 'modal-open'); };
    const open = (src, alt) => { $('#imgLightboxSrc', box).src = src; $('#imgLightboxSrc', box).alt = alt || 'Full size preview'; box.hidden = false; setBodyLock(true, 'modal-open'); };
    document.addEventListener('click', e => {
      if (e.target.closest('[data-lb-close]')) return close();
      const image = e.target.closest('img.lb-clickable, #reviews-list img, #hiring-list img, .job-modal-gallery img');
      if (image && !image.closest('.ao-whatsapp-float') && !image.closest('.ao-lara-float')) { e.preventDefault(); open(image.currentSrc || image.src, image.alt); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
  }

  function initLaraChat() {
    if ($('#laraChat')) return;
    const triggers = $$('[data-lara-open]');
    if (!triggers.length) return;

    const panel = document.createElement('div');
    panel.id = 'laraChat';
    panel.className = 'lara-chat';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="lara-backdrop" data-lara-close></div>
      <section class="lara-panel" role="dialog" aria-modal="true" aria-labelledby="laraTitle">
        <header class="lara-header">
          <div class="lara-identity"><img src="assets/images/lara-robot.svg" alt=""><div><strong id="laraTitle">Ask Lara</strong><small>Avenix Overseas AI assistant</small></div></div>
          <div class="lara-header-actions"><button type="button" class="lara-clear" id="laraClear">Clear</button><button type="button" class="lara-close" data-lara-close aria-label="Close Lara">&times;</button></div>
        </header>
        <div class="lara-messages" id="laraMessages" aria-live="polite"></div>
        <form class="lara-form" id="laraForm"><textarea id="laraInput" rows="1" maxlength="1800" placeholder="Ask Lara anything…" aria-label="Message Lara"></textarea><button type="submit" id="laraSend" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i></button></form>
      </section>`;
    document.body.appendChild(panel);

    const messages = $('#laraMessages', panel);
    const form = $('#laraForm', panel);
    const input = $('#laraInput', panel);
    const send = $('#laraSend', panel);
    const clear = $('#laraClear', panel);
    const storageKey = 'avenix_lara_messages_v4';
    let conversation = [];
    let busy = false;
    let lastFocus = null;


    try {
      conversation = JSON.parse(sessionStorage.getItem(storageKey) || '[]')
        .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-30);
    } catch (_) {}

    const save = () => {
      try { sessionStorage.setItem(storageKey, JSON.stringify(conversation.slice(-30))); } catch (_) {}
    };
    const scroll = () => requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));

    // Small, deterministic Markdown renderer for Lara. It intentionally supports only
    // safe chat formatting so raw **bold** markers never appear to the visitor.
    const renderMarkdown = value => {
      let text = escapeHtml(value).replace(/\r\n/g, '\n');
      text = text.replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>');
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
      text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
      text = text.replace(/^[-*]\s+(.+)$/gm, '• $1');
      text = text.replace(/^(\d+)\.\s+(.+)$/gm, '<strong>$1.</strong> $2');
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
      text = text.replace(/\n/g, '<br>');
      return text;
    };

    const render = () => {
      messages.innerHTML = '';
      if (!conversation.length) {
        const welcome = document.createElement('div');
        welcome.className = 'lara-welcome';
        welcome.innerHTML = '<strong>Hi! I’m Lara, the Avenix Overseas AI assistant. 🌍</strong><p>You can speak or type in your preferred language, including English, Hindi, Hinglish, Urdu, Bangla, Nepali, Sinhala, Tamil and more. I’ll reply in the language and style you use. 😊</p>';
        messages.appendChild(welcome);
      }
      conversation.forEach(m => {
        const row = document.createElement('div');
        row.className = `lara-message ${m.role}`;
        row.innerHTML = renderMarkdown(m.content);
        messages.appendChild(row);
      });
      scroll();
    };

    const add = (role, content) => {
      conversation.push({ role, content });
      save();
      render();
    };

    const close = () => {
      panel.hidden = true;
      setBodyLock(false, 'lara-open');
      lastFocus?.focus?.();
    };

    const open = () => {
      lastFocus = document.activeElement;
      panel.hidden = false;
      setBodyLock(true, 'lara-open');
      render();
      setTimeout(() => input.focus({ preventScroll: true }), 80);
    };

    triggers.forEach(trigger => trigger.addEventListener('click', e => {
      e.preventDefault();
      open();
    }));

    panel.addEventListener('click', e => {
      if (e.target.closest('[data-lara-close]')) close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.hidden) close();
    });

    clear.addEventListener('click', () => {
      conversation = [];
      try { sessionStorage.removeItem(storageKey); } catch (_) {}
      render();
      input.focus();
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    async function askLara() {
      const endpoint = `${String(window.AVENIX_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/lara-chat`;
      if (!window.AVENIX_SUPABASE_URL || !endpoint.startsWith('http')) {
        throw new Error('Lara is temporarily unavailable.');
      }

      // Do not send Authorization/apikey headers from the browser. Lara is deployed
      // with JWT verification disabled, and those headers force a CORS preflight.
      // This project's gateway is currently returning 503 for OPTIONS. A string body
      // without a custom Content-Type is sent as a simple text/plain POST, avoiding
      // that failing preflight while keeping all private secrets server-side.
      const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          messages: conversation.slice(-12)
        }),
        cache: 'no-store',
        credentials: 'omit'
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok || !data?.ok || !data?.reply) {
        console.error('Lara Edge Function response:', response.status, raw);
        throw new Error(data?.error || `Lara service returned ${response.status}.`);
      }
      return String(data.reply);
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;

      add('user', text);
      input.value = '';
      input.style.height = 'auto';
      busy = true;
      send.disabled = true;
      input.disabled = true;

      const loading = document.createElement('div');
      loading.className = 'lara-message assistant lara-loading';
      loading.innerHTML = '<span></span><span></span><span></span><em>Lara is thinking…</em>';
      messages.appendChild(loading);
      scroll();

      try {
        const answer = await askLara();
        loading.remove();
        add('assistant', answer);
      } catch (error) {
        loading.remove();
        add('assistant', 'I’m having trouble reaching Lara right now. Please try again shortly or contact the Avenix Overseas expert team. 📌');
        console.error('Lara request failed:', error);
      } finally {
        busy = false;
        send.disabled = false;
        input.disabled = false;
        input.focus();
      }
    });

    render();
  }

  function clearAdminLeaveMarker() {
    try {
      if (!sessionStorage.getItem('avenix_admin_left_at')) return;
      sessionStorage.removeItem('avenix_admin_left_at');
      if (window.supabase && window.AVENIX_SUPABASE_URL && window.AVENIX_SUPABASE_ANON_KEY) {
        const db = window.supabase.createClient(window.AVENIX_SUPABASE_URL, window.AVENIX_SUPABASE_ANON_KEY);
        db.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } catch (_) {}
  }

  function initCommon() {
    clearAdminLeaveMarker();
    initMobileNav();
    initHeaderScroll();
    initHeroSlider();
    initContactForms();
    initLightbox();
    initLaraChat();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCommon); else initCommon();
})();
