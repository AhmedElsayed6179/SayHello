import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-notfound',
  imports: [RouterLink, TranslateModule, CommonModule],
  templateUrl: './notfound.html',
  styleUrl: './notfound.scss',
})
export class Notfound {
  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }
}
