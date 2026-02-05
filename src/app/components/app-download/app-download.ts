import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-app-download',
  imports: [TranslatePipe, CommonModule],
  templateUrl: './app-download.html',
  styleUrl: './app-download.css',
})
export class AppDownload {
  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
}
