import XQPlugin from "./main";
import type { ISettings } from "./types";
import { type App, PluginSettingTab, Setting } from "obsidian";

export const DEFAULT_SETTINGS: ISettings = {
	position: "right",
	theme: "auto",
	cellSize: 50,
	fontSize: 12,
	showCoordinateLabels: true,
	showLastMove: true,
	showTurnBorder: true,
	autoJump: "auto",
	enableSpeech: true,
	showMovelist: true,
	showMovelistText: true,
	boardMarginTop: 20,
	boardMarginBottom: 20,
	// iOS specific settings
	iOSBoardMarginTop: 10,
	iOSBoardMarginBottom: 10,
	iOSCellSize: 40,
	iOSPosition: "bottom",
	// Comments box height
	commentsBoxHeight: 200,
	// Branch color
	branchColor: "rgba(0, 255, 0, 0.8)",
	// NAS settings for opening identification
	nasAddress1: "http://192.168.50.159:5050/api/identify",
	nasAddress2: "",
	// Auto opening identification
	enableAutoOpeningIdentification: true,
	autoIdentificationDelay: 500,
	minMovesForIdentification: 4,
	viewOnly: false,
	rotated: false,
	showAnnotationsOnBoard: true,
};

export class XQSettingTab extends PluginSettingTab {
	plugin: XQPlugin;

	constructor(app: App, plugin: XQPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const settings = this.plugin.settings;
		let { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("主题")
			// .setDesc("设置棋盘主题.")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					light: "浅色",
					dark: "深色",
					auto: "跟随",
				});
				dropdown
					.setValue(settings.theme)
					.onChange((theme) => {
						settings.theme = theme as "auto" | "light" | "dark";
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
			});

		new Setting(containerEl)
			.setName("布局")
			// .setDesc("设置按钮的位置.")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					right: "横向",
					bottom: "纵向",
				});

				dropdown.setValue(settings.position).onChange((position) => {
					settings.position = position as "bottom" | "right";
					this.plugin.saveSettings();
					this.plugin.refresh();
				});
			});

		new Setting(containerEl)
			.setName("界面大小")
			// .setDesc("调整棋盘大小")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				// 创建显示滑块值的标签
				const valueLabel = createEl("span", {
					text: Math.abs(settings.cellSize).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(15, 100, 1)
					.setValue(settings.cellSize) // 默认值
					.onChange((value) => {
						settings.cellSize = value;
						valueLabel.textContent = value.toString(); // 确保实时更新显示值
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				// 监听 input 事件，实现拖动时实时更新
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.cellSize = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("显示坐标标签")
			// .setDesc("是否朗读棋谱走法")
			.addToggle((toggle) =>
				toggle.setValue(settings.showCoordinateLabels).onChange((value) => {
					settings.showCoordinateLabels = value;
					this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("轮次提示").setHeading();

		new Setting(containerEl)
			// .setName("是否显示当前着法")
			.setDesc("是否显示当前着法")
			.addToggle((toggle) =>
				toggle.setValue(settings.showLastMove).onChange((value) => {
					settings.showLastMove = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
				}),
			);
		new Setting(containerEl)
			// .setName("是否显示当前该谁行棋的边框")
			.setDesc("是否显示当前该谁行棋的边框")
			.addToggle((toggle) =>
				toggle.setValue(settings.showTurnBorder).onChange((value) => {
					settings.showTurnBorder = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
				}),
			);
		new Setting(containerEl)
			// .setName("是否在棋盘上显示旗标")
			.setDesc("是否在棋盘棋子上显示旗标标记")
			.addToggle((toggle) =>
				toggle.setValue(settings.showAnnotationsOnBoard ?? true).onChange((value) => {
					settings.showAnnotationsOnBoard = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
				}),
			);

		new Setting(containerEl).setName("着法列表").setHeading();

		new Setting(containerEl)
			// .setName("是否启用着法列表")
			.setDesc("是否显示棋谱着法列表")
			.addToggle((toggle) =>
				toggle.setValue(settings.showMovelist).onChange((value) => {
					settings.showMovelist = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
				}),
			);

		new Setting(containerEl)
			// .setName("是否显示着法文字")
			.setDesc("是否显示棋谱着法文字")
			.addToggle((toggle) =>
				toggle.setValue(settings.showMovelistText).onChange((value) => {
					settings.showMovelistText = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
					this.display();
				}),
			);
		new Setting(containerEl)
			// .setName("着法文字大小")
			.setDesc("调整着法文字大小")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				// 创建显示滑块值的标签
				const valueLabel = createEl("span", {
					text: Math.abs(settings.fontSize).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(10, 25, 1)
					.setValue(settings.fontSize) // 默认值
					.onChange((value) => {
						settings.fontSize = value;
						valueLabel.textContent = value.toString(); // 确保实时更新显示值
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				// 监听 input 事件，实现拖动时实时更新
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.fontSize = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("开局跳转")
			.setDesc("初始渲染时是否直接跳转至终局")
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						never: "从不",
						always: "始终",
						auto: "无FEN即正常开局时",
					})
					.setValue(settings.autoJump)
					.onChange(async (value) => {
						settings.autoJump = value as "never" | "always" | "auto";
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("棋盘边距").setHeading();

		new Setting(containerEl)
			.setName("上边距")
			.setDesc("调整棋盘顶部边距")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.boardMarginTop).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(0, 100, 1)
					.setValue(settings.boardMarginTop)
					.onChange((value) => {
						settings.boardMarginTop = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.boardMarginTop = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("下边距")
			.setDesc("调整棋盘底部边距")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.boardMarginBottom).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(0, 100, 1)
					.setValue(settings.boardMarginBottom)
					.onChange((value) => {
						settings.boardMarginBottom = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.boardMarginBottom = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl).setName("iOS 特定设置").setHeading();

		new Setting(containerEl)
			.setName("iOS 上边距")
			.setDesc("调整 iOS 设备上的棋盘顶部边距")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.iOSBoardMarginTop).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(0, 100, 1)
					.setValue(settings.iOSBoardMarginTop)
					.onChange((value) => {
						settings.iOSBoardMarginTop = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.iOSBoardMarginTop = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("iOS 下边距")
			.setDesc("调整 iOS 设备上的棋盘底部边距")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.iOSBoardMarginBottom).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(0, 100, 1)
					.setValue(settings.iOSBoardMarginBottom)
					.onChange((value) => {
						settings.iOSBoardMarginBottom = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.iOSBoardMarginBottom = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("iOS 界面大小")
			.setDesc("调整 iOS 设备上的棋盘大小")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.iOSCellSize).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(15, 100, 1)
					.setValue(settings.iOSCellSize)
					.onChange((value) => {
						settings.iOSCellSize = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.iOSCellSize = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("iOS 布局")
			.setDesc("设置 iOS 设备上的布局方向")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					right: "横向",
					bottom: "纵向",
				});

				dropdown
					.setValue(settings.iOSPosition)
					.onChange((position) => {
						settings.iOSPosition = position as "bottom" | "right";
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
			});

		new Setting(containerEl)
			.setName("注释框高度")
			.setDesc("调整注释框的高度")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: Math.abs(settings.commentsBoxHeight).toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(50, 500, 10)
					.setValue(settings.commentsBoxHeight)
					.onChange((value) => {
						settings.commentsBoxHeight = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.commentsBoxHeight = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("变招分支颜色")
			.setDesc("调整变招分支的颜色")
			.addText((text) =>
				text.setValue(settings.branchColor).onChange((value) => {
					settings.branchColor = value;
					this.plugin.saveSettings();
					this.plugin.refresh();
				}),
			);

		if (window.speechSynthesis) {
			new Setting(containerEl)
				.setName("朗读着法")
				// .setDesc("是否朗读棋谱走法")
				.addToggle((toggle) =>
					toggle.setValue(settings.enableSpeech).onChange((value) => {
						settings.enableSpeech = value;
						this.plugin.saveSettings();
					}),
				);
		}

		new Setting(containerEl).setName("开局识别NAS设置").setHeading();

		new Setting(containerEl)
			.setName("NAS地址1")
			.setDesc("第一个NAS局域网地址，用于开局识别")
			.addText((text) =>
				text.setValue(settings.nasAddress1).onChange((value) => {
					settings.nasAddress1 = value;
					this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("NAS地址2")
			.setDesc("第二个NAS局域网地址，当第一个地址不可用时使用")
			.addText((text) =>
				text.setValue(settings.nasAddress2).onChange((value) => {
					settings.nasAddress2 = value;
					this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("自动开局识别").setHeading();

		new Setting(containerEl)
			.setName("启用自动识别")
			.setDesc("每走一步棋自动识别开局名称")
			.addToggle((toggle) =>
				toggle.setValue(settings.enableAutoOpeningIdentification).onChange((value) => {
					settings.enableAutoOpeningIdentification = value;
					this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("识别延迟")
			.setDesc("走棋后延迟多少毫秒进行识别（避免频繁请求）")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: settings.autoIdentificationDelay.toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(0, 2000, 100)
					.setValue(settings.autoIdentificationDelay)
					.onChange((value) => {
						settings.autoIdentificationDelay = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.autoIdentificationDelay = value;
					valueLabel.textContent = value.toString();
				});
			});

		new Setting(containerEl)
			.setName("最小识别步数")
			.setDesc("至少需要多少步棋才开始识别（确保开局特征足够明显）")
			.addSlider((slider) => {
				const controlEl = slider.sliderEl.parentElement!;
				const valueLabel = createEl("span", {
					text: settings.minMovesForIdentification.toString(),
					cls: "slider-value-label",
				});
				controlEl.prepend(valueLabel);
				slider
					.setLimits(2, 10, 1)
					.setValue(settings.minMovesForIdentification)
					.onChange((value) => {
						settings.minMovesForIdentification = value;
						valueLabel.textContent = value.toString();
						this.plugin.saveSettings();
					});
				slider.sliderEl.addEventListener("input", () => {
					const value = slider.getValue();
					settings.minMovesForIdentification = value;
					valueLabel.textContent = value.toString();
				});
			});
	}
	async hide() {
		this.plugin.refresh();

	}
}
