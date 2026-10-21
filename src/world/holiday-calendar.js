// Calendar rules: opm.gov/policy-data-oversight/pay-leave/federal-holidays/; gov.uk/bank-holidays;
// law.go.kr 관공서의 공휴일에 관한 규정. Lunar dates are Korean, not Chinese Intl dates.
import {KOREAN_LUNAR_HOLIDAYS} from './korean-holiday-dates.js';
const DAY=86400000;
const utc=(y,m,d)=>Date.UTC(y,m-1,d);
const weekday=stamp=>new Date(stamp).getUTCDay();
export function easterDate(y) {
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
    const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,n=Math.floor((a+11*h+22*l)/451);
    const month=Math.floor((h+l-7*n+114)/31),day=(h+l-7*n+114)%31+1;
    return {year:y,month,day};
}
const nth=(y,m,w,n)=>utc(y,m,1)+(7*(n-1)+(w-weekday(utc(y,m,1))+7)%7)*DAY;
const last=(y,m,w)=>{const end=utc(y,m+1,0);return end-(weekday(end)-w+7)%7*DAY;};
function event(name,start,scope,kind='public holiday',end=start){return {name,start,end,scope,kind};}
export function holidayCalendar(year,country) {
    const rows=[],add=(name,m,d,kind='public holiday',scope=country)=>rows.push(event(name,utc(year,m,d),scope,kind));
    const addAt=(name,stamp,scope=country,kind='public holiday')=>rows.push(event(name,stamp,scope,kind));
    const easter=easterDate(year),ed=utc(year,easter.month,easter.day);
    if(country==='us'||country==='uk') {
        add("New Year's Day",1,1);
        add("Valentine's Day",2,14,'cultural occasion');
        addAt('Easter',ed,country,'religious/cultural occasion');
        add('Halloween',10,31,'cultural occasion');
        add('Christmas',12,25);
    }
    if(country==='us') {
        if(year>=1986)addAt('Martin Luther King Jr. Day',nth(year,1,1,3));
        addAt("Washington's Birthday / Presidents' Day",nth(year,2,1,3));
        addAt('Memorial Day',last(year,5,1));
        if(year>=2021)add('Juneteenth',6,19);
        add('Independence Day',7,4);
        addAt('Labor Day',nth(year,9,1,1));
        addAt('Columbus Day / Indigenous Peoples observances',nth(year,10,1,2),'US; observance varies locally');
        add('Veterans Day',11,11);
        addAt('Thanksgiving',nth(year,11,4,4));
        for(const row of [...rows].filter(r=>r.kind==='public holiday')) {
            const day=weekday(row.start),shift=day===6?-1:day===0?1:0;
            if(shift)rows.push(event(row.name+' (federal observed day)',row.start+shift*DAY,'US federal schedule; other closures vary'));
        }
    }
    if(country==='uk') {
        addAt('Good Friday',ed-2*DAY);
        addAt('Easter Monday',ed+DAY,'England, Wales and Northern Ireland');
        addAt('Early May bank holiday',nth(year,5,1,1));
        addAt('Spring bank holiday',last(year,5,1));
        addAt('Summer bank holiday',nth(year,8,1,1),'Scotland');
        addAt('Summer bank holiday',last(year,8,1),'England, Wales and Northern Ireland');
        add('2 January holiday',1,2,'public holiday','Scotland');
        add("St Patrick's Day",3,17,'public holiday','Northern Ireland');
        add('Battle of the Boyne holiday',7,12,'public holiday','Northern Ireland');
        add("St Andrew's Day",11,30,'public holiday','Scotland');
        add('Boxing Day',12,26);
        add('Bonfire Night',11,5,'cultural occasion');
        // Substitute days are allocated separately per region to avoid Christmas/Boxing Day collisions.
        for(const region of ['England and Wales','Scotland','Northern Ireland']) {
            const applicable=rows.filter(r=>r.kind==='public holiday'&&(r.scope==='uk'||r.scope.includes(region)||region==='England and Wales'&&r.scope.includes('England, Wales')));
            const occupied=new Set(applicable.map(r=>r.start));
            for(const row of applicable)if([0,6].includes(weekday(row.start))) {
                let day=row.start+DAY;
                while([0,6].includes(weekday(day))||occupied.has(day))day+=DAY;
                occupied.add(day);rows.push(event(row.name+' (substitute day)',day,region));
            }
        }
    }
    if(country==='kr') {
        add("New Year's Day",1,1);
        add('March 1st Movement Day',3,1);add("Children's Day",5,5);add('Memorial Day',6,6);
        if(year>=2026||year>=1949&&year<=2007)add('Constitution Day',7,17);
        add('Liberation Day',8,15);add('National Foundation Day',10,3);add('Hangul Day',10,9);add('Christmas',12,25);
        const lunar=KOREAN_LUNAR_HOLIDAYS[year-1900];
        if(lunar)for(const [index,md] of lunar.split(',').entries()) {
            const [m,d]=md.split('-').map(Number),stamp=utc(year,m,d);
            rows.push(event(['Seollal','Buddha’s Birthday','Chuseok'][index],stamp-(index===1?0:DAY),'kr','public holiday',stamp+(index===1?0:DAY)));
        }
        // Historical holiday law changes are not extrapolated from today's rules.
        if(year>=2014) {
            const occupied=new Set(rows.flatMap(r=>Array.from({length:(r.end-r.start)/DAY+1},(_,i)=>r.start+i*DAY)));
            for(const row of [...rows]) {
                const lunarBreak=['Seollal','Chuseok'].includes(row.name);
                const supported=row.name==="Children's Day"||lunarBreak||
                    (year>2021||year===2021&&row.start>=utc(year,8,15))&&['March 1st Movement Day','Liberation Day','National Foundation Day','Hangul Day'].includes(row.name)||
                    year>=2023&&['Buddha’s Birthday','Christmas'].includes(row.name);
                if(!supported)continue;
                const days=Array.from({length:(row.end-row.start)/DAY+1},(_,i)=>row.start+i*DAY);
                const overlap=days.some(day=>rows.some(other=>other!==row&&day>=other.start&&day<=other.end));
                if(!overlap&&!days.some(day=>weekday(day)===0||!lunarBreak&&weekday(day)===6))continue;
                let day=row.end+DAY;
                while([0,6].includes(weekday(day))||occupied.has(day))day+=DAY;
                occupied.add(day);rows.push(event(row.name+' (substitute day)',day,'kr'));
            }
        }
    }
    return rows;
}
export function holidayMaterials(date,countries) {
    if(!date?.day||!date?.month)return [];
    // An unspecified year cannot safely determine movable holidays or observed weekdays.
    const year=date.year??2000,now=utc(year,date.month,date.day),items=new Map();
    for(const country of countries)for(const y of [year-1,year,year+1])for(const item of holidayCalendar(y,country)) {
        if(date.year===null&&!["New Year's Day","Valentine's Day",'Halloween','Christmas','Independence Day','Bonfire Night','Boxing Day','March 1st Movement Day',"Children's Day",'Memorial Day','Liberation Day','National Foundation Day','Hangul Day'].includes(item.name))continue;
        if(now<item.start-7*DAY||now>item.end+2*DAY)continue;
        if(date.year===null&&country==='us'&&item.name==='Memorial Day')continue;
        const phase=now<item.start?'approaching':now>item.end?'just passed':'current date';
        const key=item.name+':'+item.start+':'+phase;
        if(!items.has(key))items.set(key,{...item,phase,scopes:new Set()});
        items.get(key).scopes.add(item.scope);
    }
    return [...items.values()].map(item=>item.name+' — '+item.phase+'; '+[...item.scopes].map(s=>({us:'US',uk:'UK',kr:'South Korea'}[s]||s)).join(', ')+'; '+item.kind+'.');
}

