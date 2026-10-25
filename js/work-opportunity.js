/* Avenix Overseas — Work Opportunity / Hiring public view.
 * Public listings use is_published for visibility and is_hiring_live for the
 * current application status. Includes search/filtering, shareable job URLs,
 * contextual enquiry links and accessible detail modal.
 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v ?? '').trim();
  let jobs = [], filtered = [], activeJob = null;

  function client() {
    if (!window.supabase?.createClient || !window.AVENIX_SUPABASE_URL || !window.AVENIX_SUPABASE_ANON_KEY) return null;
    return window.supabase.createClient(window.AVENIX_SUPABASE_URL, window.AVENIX_SUPABASE_ANON_KEY);
  }
  function images(job) {
    const v = job?.image_url;
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    const s = norm(v); if (!s) return [];
    if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.filter(Boolean).map(String); } catch (_) {} }
    return [s];
  }
  function published(job) { return job?.is_published !== false && (job?.is_published === true || job?.is_active !== false); }
  function live(job) { return Boolean(job?.is_hiring_live); }
  function displayDate(job) { const value = job?.posting_date || job?.created_at; if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}); }
  function sector(job) {
    const s = `${job?.sector || ''} ${job?.job_title || ''} ${job?.position || ''} ${job?.employment_type || ''} ${job?.description || ''}`.toLowerCase();
    if (/driver|driving|transport/.test(s)) return 'Driver & Transport';
    if (/warehouse|logistic|supply chain/.test(s)) return 'Warehouse & Logistics';
    if (/food|delivery|restaurant|hospitality|hotel/.test(s)) return /delivery/.test(s) ? 'Food Delivery' : 'Hospitality';
    if (/construction|builder|mason/.test(s)) return 'Construction';
    if (/agricultur|farm|harvest/.test(s)) return 'Agriculture';
    if (/administr|office|customer service/.test(s)) return 'Administration & Office';
    if (/it|software|developer|technology|digital/.test(s)) return 'IT & Technology';
    if (/factory|production|manufactur/.test(s)) return 'Factory & Production';
    return job?.sector || 'Other';
  }
  function interview(job) {
    if (typeof job?.interview_required === 'boolean') return job.interview_required ? 'Yes' : 'No';
    if (/Interview:\s*Yes/i.test(job?.requirements || '') || job?.employer === 'Interview:Yes') return 'Yes';
    if (/Interview:\s*No/i.test(job?.requirements || '')) return 'No';
    return '';
  }
  function cleanRequirements(v) { return String(v || '').replace(/^Interview:\s*(Yes|No)\s*/i, '').trim(); }
  function contactUrl(job) {
    const p = new URLSearchParams();
    p.set('job', String(job?.id || ''));
    p.set('job_title', job?.job_title || ''); p.set('country', job?.country || '');
    return `contact.html?${p.toString()}#consultation`;
  }
  function jobUrl(job) { return `work-opportunity.html?job=${encodeURIComponent(String(job.id))}#careers`; }
  function renderFilters() {
    const country = $('#jobCountryFilter'), sectorEl = $('#jobSectorFilter');
    const countries = [...new Set(jobs.map(j => norm(j.country)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if (country) country.innerHTML = '<option value="">All countries</option>' + countries.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const sectors = [...new Set(jobs.map(sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if (sectorEl) sectorEl.innerHTML = '<option value="">All sectors</option>' + sectors.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
  function applyFilters() {
    const q = norm($('#jobSearch')?.value).toLowerCase(), c = norm($('#jobCountryFilter')?.value).toLowerCase(), s = norm($('#jobSectorFilter')?.value).toLowerCase(), st = norm($('#jobStatusFilter')?.value);
    filtered = jobs.filter(j => {
      const hay = [j.job_title,j.country,j.location,j.city,j.position,j.employment_type,j.salary,j.description,j.requirements,j.benefits,sector(j)].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!c || norm(j.country).toLowerCase() === c) && (!s || sector(j).toLowerCase() === s) && (!st || (st === 'live' ? live(j) : !live(j)));
    });
    renderJobs();
    const count = $('#jobResultCount'); if (count) count.textContent = `${filtered.length} published opportunit${filtered.length === 1 ? 'y' : 'ies'}`;
  }
  function card(job, i) {
    const img = images(job)[0], isLive = live(job);
    const city = job.city || job.location;
    const position = job.position || job.employment_type;
    return `<article class="job-card">
      ${img ? `<button class="job-card-image job-image-trigger" type="button" data-full-image="${esc(img)}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open job image"><img src="${esc(img)}" alt="${esc(job.job_title || 'Work opportunity image')}" loading="lazy"></button>` : ''}
      <div class="job-card-top"><span class="job-country">${esc(job.country || 'International')}</span><span class="job-status ${isLive ? 'is-live' : ''}">${isLive ? '<i class="fa-solid fa-circle"></i> Live Hiring' : 'Hiring Closed'}</span><span class="job-type">${esc(sector(job))}</span></div>
      <h3>${esc(job.job_title || 'Work opportunity')}</h3>
      <p class="job-summary">${esc(city || '')}${position ? ` · ${esc(position)}` : ''}${(job.estimated_salary || job.salary) ? ` · ${esc(job.estimated_salary || job.salary)}${job.salary_period ? ` ${esc(job.salary_period)}` : ''}` : ''}</p>
      <div class="job-mini-meta">${job.positions ? `<span><i class="fa-solid fa-users"></i> ${esc(job.positions)} position${Number(job.positions) === 1 ? '' : 's'}</span>` : ''}${interview(job) ? `<span><i class="fa-solid fa-comments"></i> Interview ${esc(interview(job))}</span>` : ''}</div>
      ${job.opportunity_type ? `<div class="job-mini-meta"><span><i class="fa-solid fa-route"></i> ${esc(job.opportunity_type)}</span></div>` : ''}
      ${displayDate(job) ? `<div class="job-post-date"><i class="fa-regular fa-calendar"></i> Posted ${esc(displayDate(job))}</div>` : ''}
      ${job.description ? `<p class="job-excerpt">${esc(String(job.description).slice(0, 180))}${String(job.description).length > 180 ? '…' : ''}</p>` : ''}
      <button class="btn btn-dark job-view" type="button" data-job-index="${i}">View details</button>
    </article>`;
  }
  function renderJobs() {
    const host = $('#hiring-list'); if (!host) return;
    if (!filtered.length) { host.innerHTML = '<div class="job-empty"><strong>No matching published opportunities.</strong><br><span>Try another country, sector or search term.</span></div>'; return; }
    host.innerHTML = filtered.map(card).join('');
  }
  function openModal(job, updateUrl = true) {
    const modal = $('#jobModal'), body = $('#jobModalBody'); if (!modal || !body || !job) return;
    activeJob = job;
    const imgs = images(job), isLive = live(job), city = job.city || job.location, position = job.position || job.employment_type, req = cleanRequirements(job.requirements);
    const meta = [job.country, city, position, (job.estimated_salary || job.salary)].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('');
    const sections = [['Job description',job.description],['Requirements',req],['Benefits',job.benefits],['Accommodation',job.accommodation],['Application information',job.application_information || job.application_info]].filter(([,v])=>v);
    body.innerHTML = `${imgs[0] ? `<button class="job-modal-hero-image job-image-trigger" type="button" data-full-image="${esc(imgs[0])}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open full job image"><img src="${esc(imgs[0])}" alt="${esc(job.job_title || 'Work opportunity image')}"></button>` : ''}
      <div class="job-modal-status ${isLive ? 'is-live' : ''}">${isLive ? '<i class="fa-solid fa-circle"></i> Currently Hiring' : 'Hiring Closed — published for reference'}</div>
      <h2 id="jobModalTitle">${esc(job.job_title || 'Work opportunity')}</h2>
      ${meta ? `<div class="job-meta-line">${meta}</div>` : ''}
      <div class="job-facts">${job.opportunity_type ? `<div><strong>Opportunity</strong><span>${esc(job.opportunity_type)}</span></div>`:''}${job.positions ? `<div><strong>Positions</strong><span>${esc(job.positions)}</span></div>`:''}${job.experience ? `<div><strong>Experience</strong><span>${esc(job.experience)}</span></div>`:''}${interview(job) ? `<div><strong>Interview required</strong><span>${esc(interview(job))}</span></div>`:''}${job.employment_type && job.position ? `<div><strong>Employment</strong><span>${esc(job.employment_type)}</span></div>`:''}</div>
      ${sections.map(([t,v])=>`<section class="job-detail-section"><h3>${esc(t)}</h3><div>${esc(v)}</div></section>`).join('')}
      ${imgs.length>1 ? `<div class="job-modal-gallery">${imgs.map((u,n)=>`<button class="job-image-trigger" type="button" data-full-image="${esc(u)}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open job image ${n+1}"><img src="${esc(u)}" alt="${esc(job.job_title || 'Work opportunity image')}" loading="lazy"></button>`).join('')}</div>`:''}
      <div class="job-modal-actions"><a class="btn btn-gold job-apply" href="${esc(contactUrl(job))}">Enquire about this opportunity</a><a class="btn btn-dark" target="_blank" rel="noopener" href="https://wa.me/918006355135?text=${encodeURIComponent(`Hi Avenix, I am interested in ${job.job_title || 'this work opportunity'}${job.country ? ` in ${job.country}` : ''}.`)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp enquiry</a><button type="button" class="btn btn-dark" id="shareJobBtn"><i class="fa-solid fa-share-nodes"></i> Share opportunity</button><button type="button" class="btn btn-line" id="copyJobBtn"><i class="fa-solid fa-link"></i> Copy link</button></div>`;
    modal.hidden=false; modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open','job-modal-open');
    if (updateUrl) history.replaceState({},'',jobUrl(job));
    $('#jobModal .job-modal-close')?.focus();
  }
  function closeModal() { const m=$('#jobModal'); if(!m)return; m.hidden=true;m.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open','job-modal-open');activeJob=null; if(location.search.includes('job=')) history.replaceState({},'', 'work-opportunity.html#careers'); }
  function openImage(src,alt){ if(!src)return; let v=$('#jobImageViewer'); if(!v){v=document.createElement('div');v.id='jobImageViewer';v.className='job-image-viewer';v.hidden=true;v.innerHTML='<div class="job-image-viewer-backdrop" data-image-viewer-close></div><div class="job-image-viewer-panel" role="dialog" aria-modal="true"><button class="job-image-viewer-close" type="button" data-image-viewer-close aria-label="Close image">&times;</button><img id="jobFullImage" alt=""></div>';document.body.appendChild(v);} $('#jobFullImage',v).src=src;$('#jobFullImage',v).alt=alt||'';v.hidden=false;document.body.classList.add('image-viewer-open'); }
  function closeImage(){const v=$('#jobImageViewer');if(!v)return;v.hidden=true;document.body.classList.remove('image-viewer-open');}
  async function shareJob(){if(!activeJob)return;const url=new URL(jobUrl(activeJob),location.href).href;const data={title:`${activeJob.job_title} — Avenix Overseas`,text:`${activeJob.job_title} in ${activeJob.country || 'International'}${activeJob.city || activeJob.location ? `, ${activeJob.city || activeJob.location}`:''}`,url};try{if(navigator.share)await navigator.share(data);else await navigator.clipboard.writeText(url);}catch(_){} }
  async function copyJob(){if(!activeJob)return;try{await navigator.clipboard.writeText(new URL(jobUrl(activeJob),location.href).href);const b=$('#copyJobBtn');if(b){const old=b.innerHTML;b.innerHTML='<i class="fa-solid fa-check"></i> Link copied';setTimeout(()=>b.innerHTML=old,1600);}}catch(_){}}
  async function load(){const host=$('#hiring-list');if(!host)return;const db=client();if(!db){host.innerHTML='<div class="job-empty">Current openings are temporarily unavailable. Please refresh the page.</div>';return;}try{let res=await db.from('career_jobs').select('*').eq('is_published',true).order('created_at',{ascending:false});if(res.error){console.warn('New job visibility fields unavailable; using compatibility query.',res.error.message);res=await db.from('career_jobs').select('*').eq('is_active',true).order('created_at',{ascending:false});}if(res.error)throw res.error;jobs=(res.data||[]).filter(published);filtered=jobs;renderFilters();const params=new URLSearchParams(location.search);const countryParam=params.get('country')||'';if(countryParam&&$('#jobCountryFilter')){const opt=[...$('#jobCountryFilter').options].find(o=>o.value.toLowerCase()===countryParam.toLowerCase());if(opt)$('#jobCountryFilter').value=opt.value;}renderJobs();applyFilters();const id=params.get('job');if(id){const found=jobs.find(j=>String(j.id)===id);if(found)openModal(found,false);}}catch(e){console.error(e);host.innerHTML='<div class="job-empty">We could not load opportunities right now. Please try again later.</div>';}}
  function init(){const host=$('#hiring-list'),modal=$('#jobModal');if(!host||!modal)return;['jobSearch','jobCountryFilter','jobSectorFilter','jobStatusFilter'].forEach(id=>{$(`#${id}`)?.addEventListener(id==='jobSearch'?'input':'change',applyFilters)});$('#jobResetFilters')?.addEventListener('click',()=>{$('#jobSearch').value='';$('#jobCountryFilter').value='';$('#jobSectorFilter').value='';$('#jobStatusFilter').value='';applyFilters();});host.addEventListener('click',e=>{const v=e.target.closest('.job-view[data-job-index]');if(v){openModal(filtered[Number(v.dataset.jobIndex)]);return;}const im=e.target.closest('.job-image-trigger[data-full-image]');if(im){e.preventDefault();openImage(im.dataset.fullImage,im.dataset.imageAlt);}});modal.addEventListener('click',e=>{if(e.target.closest('[data-close-modal]'))return closeModal();const im=e.target.closest('.job-image-trigger[data-full-image]');if(im){e.preventDefault();openImage(im.dataset.fullImage,im.dataset.imageAlt);}if(e.target.closest('#shareJobBtn'))shareJob();if(e.target.closest('#copyJobBtn'))copyJob();});document.addEventListener('click',e=>{if(e.target.closest('[data-image-viewer-close]'))closeImage();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#jobImageViewer')?.hidden)closeImage();else if(!modal.hidden)closeModal();}});load();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
