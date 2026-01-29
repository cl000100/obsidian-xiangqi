/**
 * 检测当前设备是否为iOS设备
 */
export function isIOS(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return /ipad|iphone|ipod/.test(userAgent) && !(window as any).MSStream;
}

/**
 * 检测当前设备是否为移动设备
 */
export function isMobile(): boolean {
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
}

/**
 * 检测当前设备是否为iPad
 */
export function isiPad(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('ipad') || (userAgent.includes('macintosh') && navigator.maxTouchPoints > 1);
}

/**
 * 检测当前设备是否为Mac
 */
export function isMac(): boolean {
    return navigator.platform.toLowerCase().includes('mac');
}
