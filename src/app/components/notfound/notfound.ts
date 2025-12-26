import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-notfound',
  imports: [RouterLink, TranslateModule],
  templateUrl: './notfound.html',
  styleUrl: './notfound.css',
})
export class Notfound {
}
