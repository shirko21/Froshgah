import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {api} from './api.js';
const StoreContext=createContext(null);
export function StoreProvider({children}){
 const [bootstrap,setBootstrap]=useState(null);const [cart,setCart]=useState(()=>JSON.parse(localStorage.getItem('flexishop-cart')||'[]'));const [loading,setLoading]=useState(true);
 useEffect(()=>{api('/api/public/bootstrap').then(setBootstrap).finally(()=>setLoading(false))},[]);
 useEffect(()=>localStorage.setItem('flexishop-cart',JSON.stringify(cart)),[cart]);
 const actions=useMemo(()=>({add(product,qty=1){setCart(c=>{const found=c.find(x=>x.id===product.id);return found?c.map(x=>x.id===product.id?{...x,qty:Math.min(x.qty+qty,product.stock)}:x):[...c,{...product,qty:Math.min(qty,product.stock)}]})},remove(id){setCart(c=>c.filter(x=>x.id!==id))},qty(id,qty){setCart(c=>c.map(x=>x.id===id?{...x,qty:Math.max(1,Math.min(Number(qty),x.stock))}:x))},clear(){setCart([])}}),[]);
 return <StoreContext.Provider value={{bootstrap,loading,cart,...actions,setBootstrap}}>{children}</StoreContext.Provider>
}
export const useStore=()=>useContext(StoreContext);
