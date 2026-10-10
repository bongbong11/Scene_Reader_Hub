// Missing numeric values must never become a genuine zero score.
export function validNoul(value) {
 if(typeof value!=='number' && (typeof value!=='string'||!value.trim()))return false;
 const number=Number(value);
 return Number.isFinite(number)&&number>=0&&number<=1;
}
