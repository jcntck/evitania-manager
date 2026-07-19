import type { AppData } from '../shared/domain';
import { JsonAppRepository } from '../infrastructure/json-app-repository';
import { AppDataValidator } from '../domain/app-data-validator';

export class AppController {
  constructor(private readonly repository: JsonAppRepository,
    private readonly validator: AppDataValidator = new AppDataValidator()) {}

  load(): Promise<AppData> {
    return this.repository.load();
  }

  save(data: unknown): Promise<void> {
    this.validator.validate(data);
    return this.repository.save(data);
  }
}
