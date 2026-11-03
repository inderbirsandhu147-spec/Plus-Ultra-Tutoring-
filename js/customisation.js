export const themes = {
  lavender: {name:'Lavender',primary:'#7064b8',dark:'#574a9d',soft:'#eeeaf9',background:'#f8f9fb'},
  ocean: {name:'Ocean',primary:'#246e9a',dark:'#175479',soft:'#e4f0f8',background:'#f5f9fc'},
  forest: {name:'Forest',primary:'#397358',dark:'#28553f',soft:'#e6f2e9',background:'#f6faf7'},
  rose: {name:'Rose',primary:'#a44870',dark:'#7d3153',soft:'#f8e8ef',background:'#fcf7f9'},
  sunset: {name:'Sunset',primary:'#a65e2d',dark:'#80421b',soft:'#faeddf',background:'#fcf9f5'},
  midnight: {name:'Indigo',primary:'#4655a2',dark:'#303d80',soft:'#e8ebfa',background:'#f5f6fc'}
};
export const themeKey = user => `plus-ultra-theme:${user?.uid || 'signed-out'}`;
export function readTheme(user, storage=localStorage) {
  try {const value=storage.getItem(themeKey(user));return themes[value]?value:'lavender';}catch{return 'lavender';}
}
export function applyTheme(user, value=readTheme(user)) {
  const name=themes[value]?value:'lavender', t=themes[name], root=document.documentElement;
  root.dataset.theme=name;
  for(const [key,v] of Object.entries({'--primary':t.primary,'--primary-dark':t.dark,'--lilac':t.soft,'--bg':t.background}))root.style.setProperty(key,v);
  return name;
}
export function saveTheme(user,value,storage=localStorage) {
  if(!themes[value])throw new Error('Choose one of the available themes.');
  storage.setItem(themeKey(user),value);applyTheme(user,value);
}
