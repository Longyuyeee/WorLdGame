import { fireEvent,render,screen,within } from "@testing-library/react";
import { describe,expect,it } from "vitest";
import { App } from "./App";

describe("N21 Writer/Sequence user workflow",()=>{
  it("builds the branching and media task without writing script syntax",()=>{
    render(<App/>);const tools=within(screen.getByLabelText("对白结构工具")),kind=tools.getByLabelText("插入 P0 语句类型"),insert=tools.getByRole("button",{name:"＋ 插入"});
    fireEvent.change(kind,{target:{value:"dialogue"}});fireEvent.click(insert);expect(screen.getByRole("button",{name:/选择对白：新对白/})).toBeVisible();
    fireEvent.change(kind,{target:{value:"choice"}});fireEvent.click(insert);expect(screen.getByRole("form",{name:"选择类型化参数"})).toBeVisible();expect(screen.getAllByText(/option_ui_/)).toHaveLength(2);
    const optionLabels=screen.getAllByLabelText("选项文本");fireEvent.change(optionLabels[0]!,{target:{value:"留下"}});fireEvent.change(optionLabels[1]!,{target:{value:"继续"}});fireEvent.submit(screen.getByRole("form",{name:"选择类型化参数"}));expect(screen.getByRole("button",{name:/选择选择：请选择/})).toBeVisible();
    for(const value of ["set","label","condition","background","audio","end"]){fireEvent.change(kind,{target:{value}});fireEvent.click(insert);}
    expect(screen.getByRole("form",{name:"结局类型化参数"})).toBeVisible();expect(screen.getByText(/本地事务 · r9/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab",{name:"Script"}));const source=(screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value;
    expect(source).toContain('choice "请选择"');expect(source).toContain('"留下" ->');expect(source).toContain("set flag = true");expect(source).toContain("if flag ->");expect(source).toContain("@background asset=asset_missing");expect(source).toContain("@audio asset=asset_missing");expect(source).toContain('end "新结局"');
  });

  it("offers keyboard and touch alternatives plus multi-select collapse",()=>{render(<App/>);const tools=within(screen.getByLabelText("对白结构工具"));expect(tools.getByRole("button",{name:"＋ 插入"})).toHaveAttribute("aria-keyshortcuts","Control+Enter");fireEvent.click(tools.getByRole("button",{name:"多选"}));const cards=screen.getAllByRole("button",{name:/^选择/});fireEvent.click(cards[1]!);expect(tools.getByRole("button",{name:/已选/})).toBeVisible();fireEvent.click(tools.getByRole("button",{name:"折叠"}));expect(screen.getAllByText("已折叠")).toHaveLength(2);expect(tools.getByRole("button",{name:"展开"})).toBeEnabled();});
});
