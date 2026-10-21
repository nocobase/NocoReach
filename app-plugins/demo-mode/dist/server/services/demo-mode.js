export class DefaultDemoModeService {
    mode;
    allowTables;
    constructor(settings) {
        this.mode = settings.mode;
        this.allowTables = [...settings.allowTables];
    }
}
//# sourceMappingURL=demo-mode.js.map