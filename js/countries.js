(() => {
  'use strict';
  const input=document.querySelector('#countrySearch'),count=document.querySelector('#countryResultCount'),result=document.querySelector('#countrySearchResult');
  const chips=[...document.querySelectorAll('.country-chip')];
  if(!input)return;
  const normalize=v=>String(v||'').trim().toLowerCase();
  const update=()=>{
    const q=normalize(input.value); let n=0; let matches=[];
    chips.forEach(c=>{const text=(c.textContent||'').trim();const show=!q||normalize(text).includes(q);c.hidden=!show;if(show)n++;if(q&&show&&matches.length<6)matches.push(c);});
    if(count)count.textContent=`${n} destination${n===1?'':'s'} shown`;
    if(result){
      if(!q){result.innerHTML='<div class="country-search-empty">Start typing to see a matching destination here.</div>';return;}
      if(!matches.length){result.innerHTML='<div class="country-search-empty">No matching destination found. Try another spelling.</div>';return;}
      result.innerHTML='<div class="country-result-label">Matching destinations</div>'+matches.map(c=>{const a=c.cloneNode(true);a.removeAttribute('hidden');return `<a class="country-result-chip" href="${a.getAttribute('href')||'contact.html'}">${a.innerHTML}</a>`}).join('');
    }
  };
  input.addEventListener('input',update);update();

  const countryNames=[...new Set(chips.map(c=>(c.textContent||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const a=document.querySelector('#countryCompareA'),b=document.querySelector('#countryCompareB'),link=document.querySelector('#countryCompareLink');
  if(a&&b&&link){
    const opts=countryNames.map(n=>`<option value="${n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}">${n}</option>`).join('');
    a.innerHTML=opts;b.innerHTML=opts;
    if(countryNames.includes('Germany'))a.value='Germany';
    if(countryNames.includes('Italy'))b.value='Italy';
    const updateLink=()=>{link.href=`compare-countries.html?a=${encodeURIComponent(a.value)}&b=${encodeURIComponent(b.value)}`;};
    a.addEventListener('change',updateLink);b.addEventListener('change',updateLink);updateLink();
  }
})();
