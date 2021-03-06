import {Pipe, PipeTransform} from 'angular2/core';
import moment from 'moment';

@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {
  transform(value: number, units: string = 'ms'): string {
    if (!Number.isInteger(value)) return '\u221E';
    return moment.duration(value, units).humanize();
  }
}

