import { describe, expect, it } from 'vitest'
import { parseBhav, parseNavAll, parseNavHistory } from './parsers'
describe('parsers', () => {
  it('NAVAll', () => {
    const t = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\r\n\r\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\r\n\r\nPPFAS Mutual Fund\r\n\r\n122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;94.9255;24-Nov-2026\r\n'
    expect(parseNavAll(t)).toEqual([{ code: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', nav: 94.9255, nav_date: '2026-11-24' }])
  })
  it('NAVAll 2026 layout with Plan/Option columns', () => {
    const t = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n \nAxis Mutual Fund\n \n135762;INF846K01WO1;-;Axis Children\'s Fund;Direct Plan;Growth Option;31.2861;23-Nov-2026\n'
    expect(parseNavAll(t)).toEqual([{ code: '135762', name: "Axis Children's Fund - Direct Plan - Growth Option", nav: 31.2861, nav_date: '2026-11-23' }])
  })
  it('history 2026 layout', () => {
    const t = 'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date\nOpen Ended Schemes\n148921;Aditya Birla Sun Life Multi-Cap Fund-Direct Growth;Direct Plan;GROWTH;INF209KB1Y49;;23.58;20-Nov-2026'
    expect(parseNavHistory(t, new Set(['148921']))).toEqual([{ key: 'MF:148921', date: '2026-11-20', price: 23.58 }])
  })
  it('history', () => {
    const t = 'Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date\n\n122639;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;INF879O01027;;93.1;;;05-Nov-2026\n1;x;;;2;;;05-Nov-2026'
    expect(parseNavHistory(t, new Set(['122639']))).toEqual([{ key: 'MF:122639', date: '2026-11-05', price: 93.1 }])
  })
  it('bhav', () => {
    const t = 'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric\n2026-11-24,2026-11-24,CM,NSE,STK,1,INE,ITC,EQ,,,,,ITC LTD,1,1,1,410.5,410\n2026-11-24,2026-11-24,CM,NSE,STK,2,INE,X,GS,,,,,GOVT,1,1,1,1,1'
    const r = parseBhav(t, '2026-11-24', new Set(['ITC']))
    expect(r.syms.length).toBe(1)
    expect(r.prices).toEqual([{ key: 'NSE:ITC', date: '2026-11-24', price: 410.5 }])
  })
})
