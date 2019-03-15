import * as fs from 'fs';

export class Secrets {
    public static get(name: string): string {
        try {
            return fs.readFileSync(`/run/secrets/${name}`, 'utf8').trim();
        } catch(error) {
            return '';
        }
    }
}