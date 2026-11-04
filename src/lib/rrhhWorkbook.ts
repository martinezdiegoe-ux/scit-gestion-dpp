import type {CellObject,SheetData,SheetOptions,Options} from 'write-excel-file/browser';
import type {DataState,Row} from './data';
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const excelDate=(value?:string|null)=>value?new Date(`${value}T12:00:00Z`):null;
const sortCode=(a:Row,b:Row)=>a.code.localeCompare(b.code,'es',{numeric:true});
type ReportRow={assignment:Row;slot:Row;intern:Row;term?:Row;act?:Row;status:string;news:string};
export function monthlyRows(data:DataState,month:string){
 const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const rows:ReportRow[]=data.assignments.flatMap(assignment=>{
  const finish=assignment.ended_at&&assignment.ended_at<assignment.end_date?assignment.ended_at:assignment.end_date;
  if(assignment.start_date>end||finish<start)return [];
  const slot=data.slots.find(s=>s.id===assignment.slot_id),intern=data.interns.find(i=>i.id===assignment.intern_id);
  if(!slot||!intern)return [];
  const terms=data.terms.filter(t=>t.assignment_id===assignment.id).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const term=terms.find(t=>t.start_date<=end&&t.end_date>=end)||terms.filter(t=>t.start_date<=end&&t.end_date>=start).at(-1);
  const news=[assignment.start_date>=start?'Alta':'',assignment.ended_at>=start&&assignment.ended_at<=end?'Baja':'',terms.some(t=>t.kind==='RENOVACION_6'&&t.start_date>=start&&t.start_date<=end)?'Renovación':''].filter(Boolean).join(', ');
  return [{assignment,slot,intern,term,act:data.acts.find(a=>a.id===assignment.designation_act_id),status:assignment.ended_at&&assignment.ended_at<=end?'Baja':'Vigente',news}];
 });
 return rows.sort((a,b)=>sortCode(a.slot,b.slot)||a.assignment.start_date.localeCompare(b.assignment.start_date));
}


export const rrhhOptions:SheetOptions<File|Blob|ArrayBuffer>={sheet:'PASANTES',orientation:'landscape',stickyRowsCount:3,
 columns:[10,18,14,16,16,22,16,29,16,19,14,20,20,16,42,24,19].map(width=>({width})),dateFormat:'dd/mm/yyyy'};
export const rrhhFileOptions:Options<File|Blob|ArrayBuffer>={fontFamily:'Calibri',fontSize:11,features:[{files:{transform:{'xl/worksheets/sheet{id}.xml':{
 transformElementAttributes(tag,attributes){return tag==='pageSetup'?{...attributes,paperSize:9,fitToWidth:1,fitToHeight:0}:attributes;},
 transform(xml){return xml.includes('<sheetPr')?xml:xml.replace(/(<worksheet[^>]*>)/,'$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');},
}}}}]};
export function createRrhhSheet(data:DataState,month:string,amount:string):SheetData {
 const fee=amount.trim()?Number(amount):null;
 if(fee!==null&&(!Number.isFinite(fee)||fee<0))throw Error('El importe mensual debe ser un número válido');
 const titles=['N° ORDEN','RESOLUCIÓN','','','DEPENDENCIA','FUNCION / TAREA','PERSONA','','VINCULACIÓN','FECHA DE VENCIMIENTO (--/--/--)','PLAZO (meses)','ASIGNACIÓN (mensual)','CASA DE ESTUDIOS','MARCO LEGAL','OBSERVACIÓN','JURISDICCION','BASE'];
 const subtitles=['','N°','ESTADO','FECHA (--/--/--)','','','DNI','APELLIDO Y NOMBRE'];
 const sheet:SheetData=[titles,Array.from({length:17},(_,i)=>subtitles[i]||''),Array(17).fill('')].map((row,index)=>row.map((value):CellObject=>({value,type:String,fontWeight:'bold',fontSize:10,backgroundColor:index===0?'#0D2847':'#DBE6F3',textColor:index===0?'#FFFFFF':'#0D2847',align:'center',alignVertical:'center',wrap:true,height:index===0?35:28})));
 (sheet[0][1] as CellObject).columnSpan=3;(sheet[0][6] as CellObject).columnSpan=2;sheet[0][2]=null;sheet[0][3]=null;sheet[0][7]=null;
 for(const [index,r] of monthlyRows(data,month).entries()){
  const {assignment:a,intern:i,term:t,act}=r;
  const observation=[r.news,a.notes?.includes('verificar')?'Inicio de convenio pendiente de verificar':'',!act?.number?'Resolución de designación sin número':'',!t?'Convenio sin etapa registrada':''].filter(Boolean).join('; ');
  const values=[index+1,act?.number?`Res. ${act.number}${act.year?'/'+String(act.year).slice(-2):''}`:'',r.status,excelDate(act?.act_date),'S.C.I.T','Aux- Tec. Adm',String(i.dni||''),String(i.full_name||''),t?.kind==='RENOVACION_6'?'Renovación':'1° Instancia',excelDate(t?.end_date||a.end_date),t?.kind==='RENOVACION_6'?6:12,fee,String(i.university||''),'Ley 26427',observation,'Ministerio de Economía',`${months[Number(month.slice(5,7))-1]} ${month.slice(0,4)}`];
  sheet.push(values.map((value,column):CellObject=>({value:value??undefined,type:value instanceof Date?Date:typeof value==='number'?Number:String,format:column===3||column===9?'dd/mm/yyyy':column===11?'#,##0.00':undefined,bottomBorderColor:'#CDD6E4',bottomBorderStyle:'hair',alignVertical:'center',wrap:true,height:30})));
 }
 return sheet;
}
