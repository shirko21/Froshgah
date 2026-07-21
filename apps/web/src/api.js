export async function api(path,options={}){
 const response=await fetch(path,{credentials:'include',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})},...options});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error||'خطا در ارتباط با سرور');
 return data;
}
export const moneyFormat=(value,settings)=>`${new Intl.NumberFormat('fa-IR').format(Number(value||0))} ${settings?.currency_symbol||'تومان'}`;
export const asset=(url)=>url||'/placeholder.svg';
