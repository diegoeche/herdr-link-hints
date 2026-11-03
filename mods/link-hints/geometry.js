// All geometry here is in GPUI window pixels, before the mod's own zoom.
const axes = value => Array.isArray(value) ? value : [value ?? 0, value ?? 0];

function inset(rect, x, y = x) {
  return {x:rect.x+x,y:rect.y+y,width:Math.max(0,rect.width-2*x),height:Math.max(0,rect.height-2*y)};
}

export function terminalBounds(root, viewport, zoom) {
  const found = [];
  function visit(node, rect) {
    if (!node || node.hidden) return;
    const [py,px] = axes(node.padding);
    let inner = inset(rect,(px+(node.border?.width??0))*zoom,(py+(node.border?.width??0))*zoom);
    if (node.type === "block") {
      if (node.content?.tab === "active") {
        const frame=node.content.pane;
        if (frame?.lone) {
          inner=inset(inner,Math.max(frame.border?.width??0,frame.focus?.width??0)*zoom);
          const header=frame.header;
          if (header && header.reveal !== "hover") {
            const height=(header.height??30)*zoom;
            inner={...inner,y:inner.y+(header.position==="bottom"?0:height),height:inner.height-height};
          }
        }
        found.push(inner);
      }
      return;
    }
    if (node.type === "stack") {
      if (node.header) return; // Native stack headers need an actual measurement.
      const children=(node.children??[]).filter(c=>!c.hidden);
      visit(children.find(c=>c.id===node.active)??children[0],inner);
      return;
    }
    if (!["row","column"].includes(node.type)) return;
    const horizontal=node.type==="row", children=(node.children??[]).filter(c=>!c.hidden);
    const gap=((node.gap??0)+(node.divider?.width??0))*zoom;
    const total=horizontal?inner.width:inner.height;
    let remaining=Math.max(0,total-gap*Math.max(0,children.length-1));
    const lengths=new Map();
    const clamp=(c,n)=>Math.min((c.max??Infinity)*zoom,Math.max((c.min??0)*zoom,n));
    for (const child of children) if (child.size?.px!==undefined) {
      const length=clamp(child,child.size.px*zoom);lengths.set(child,length);remaining-=length;
    }
    let flex=children.filter(c=>!lengths.has(c));
    for (let pass=0;flex.length && pass<=children.length;pass++) {
      const weights=flex.reduce((sum,c)=>sum+(c.size?.weight??1),0)||1;
      const constrained=flex.filter(c=>Math.abs(clamp(c,Math.max(0,remaining)*(c.size?.weight??1)/weights)-Math.max(0,remaining)*(c.size?.weight??1)/weights)>0.001);
      if (!constrained.length) {
        for (const c of flex) lengths.set(c,Math.max(0,remaining)*(c.size?.weight??1)/weights);
        break;
      }
      for (const c of constrained) {
        const length=clamp(c,Math.max(0,remaining)*(c.size?.weight??1)/weights);
        lengths.set(c,length);remaining-=length;
      }
      flex=flex.filter(c=>!lengths.has(c));
    }
    let offset=0;
    for (const child of children) {
      const length=lengths.get(child)??0;
      visit(child,horizontal?{x:inner.x+offset,y:inner.y,width:length,height:inner.height}
        :{x:inner.x,y:inner.y+offset,width:inner.width,height:length});
      offset+=length+gap;
    }
  }
  visit(root,{x:0,y:0,width:viewport.width,height:viewport.height});
  return found.length===1?found[0]:null;
}

export function gridGeometry({root,viewport,zoom,padding,cols,rows,cellWidth,inline={},singlePane=true}) {
  if (!singlePane || !cellWidth || !cols || !rows) return null;
  const rect=terminalBounds(root,viewport,zoom);
  if (!rect) return null;
  const [px,py]=axes(padding);
  const available=inset(rect,px*zoom,py*zoom);
  if (Math.floor((available.width+0.001)/cellWidth)!==cols) return null;
  const scale=inline.device_scale??1;
  let cellHeight=inline.cell_height;
  if (!cellHeight) {
    const low=Math.floor(available.height/(rows+1)*scale)+1;
    const high=Math.floor(available.height/rows*scale+0.00001);
    if (low!==high) return null;
    cellHeight=low/scale;
  }
  if (Math.floor((available.height+0.001)/cellHeight)!==rows) return null;
  const snap=n=>Math.round(n*scale)/scale;
  return {x:snap(available.x)+(inline.offset_x??0),
    y:snap(available.y+Math.floor(Math.max(0,available.height-rows*cellHeight)/2))+(inline.offset_y??0),
    cellWidth,cellHeight,cols,rows};
}

export function normalizeConfig(value={}) {
  value=value&&typeof value==="object"?value:{};
  const number=(value,fallback,min,max)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
  return {mode:value.mode==="inline"?"inline":"window",
    inline:{device_scale:number(value.inline?.device_scale,1,0.5,4),
      cell_height:number(value.inline?.cell_height,null,4,200),
      offset_x:number(value.inline?.offset_x,0,-200,200),offset_y:number(value.inline?.offset_y,0,-200,200)},
    window:{width:number(value.window?.width,480,240,1000),max_rows:number(value.window?.max_rows,6,1,12)|0}};
}
