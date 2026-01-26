declare module 'node-unifi' {
    export class Controller {
        constructor(options: any);
        login(username: string, password: string, callback: (err: any) => void): void;
        getAccessDevices(site: string, callback: (err: any, data: any) => void): void;
        getClientDevices(site: string, callback: (err: any, data: any) => void): void;
        getSitesStats(callback: (err: any, data: any) => void): void;
    }
}
