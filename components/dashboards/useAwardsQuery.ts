import {useCallback,useEffect,useState} from 'react';
import type {ResourcesClient} from '../../lib/resources';

export function useAwardsQuery<T>(client:ResourcesClient,operation:string,args:Record<string,unknown>,enabled=true){
    const key=JSON.stringify(args),[revision,setRevision]=useState(0);
    const [state,setState]=useState<{client:ResourcesClient;key:string;data:T|null;loading:boolean;error:string}|null>(null);
    useEffect(()=>{
        if(!enabled)return;
        const abort=new AbortController();let current=true;
        setState({client,key,data:null,loading:true,error:''});
        client.awards<T>(operation,JSON.parse(key),abort.signal).then(data=>{if(current)setState({client,key,data,loading:false,error:''});}).catch(error=>{if(current&&!abort.signal.aborted)setState({client,key,data:null,loading:false,error:error instanceof Error?error.message:'Awards information is unavailable.'});});
        return()=>{current=false;abort.abort();};
    },[client,operation,key,revision,enabled]);
    const refresh=useCallback(()=>setRevision(v=>v+1),[]),matches=enabled&&state?.client===client&&state.key===key;
    return {data:matches?state.data:null,error:matches?state.error:'',loading:enabled&&(!matches||state.loading),refresh};
}
