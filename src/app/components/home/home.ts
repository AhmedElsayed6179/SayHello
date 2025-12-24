import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-home',
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home {
  usernameForm: FormGroup;
  sections: any[] = [];

  constructor(private router: Router, private translate: TranslateService) {
    this.usernameForm = new FormGroup({
      username: new FormControl('', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(20),
        Validators.pattern(/^\S+$/)
      ])
    });
    this.sections = [
      {
        icon: 'fas fa-comments',
        title: 'SECTIONS.ONE.TITLE',
        desc: 'SECTIONS.ONE.DESC',
        details: [
          'SECTIONS.ONE.DETAIL1',
          'SECTIONS.ONE.DETAIL2',
          'SECTIONS.ONE.DETAIL3'
        ]
      },
      {
        icon: 'fas fa-users',
        title: 'SECTIONS.TWO.TITLE',
        desc: 'SECTIONS.TWO.DESC',
        details: [
          'SECTIONS.TWO.DETAIL1',
          'SECTIONS.TWO.DETAIL2',
          'SECTIONS.TWO.DETAIL3'
        ]
      },
      {
        icon: 'fas fa-shield-alt',
        title: 'SECTIONS.THREE.TITLE',
        desc: 'SECTIONS.THREE.DESC',
        details: [
          'SECTIONS.THREE.DETAIL1',
          'SECTIONS.THREE.DETAIL2',
          'SECTIONS.THREE.DETAIL3'
        ]
      }
    ];
  }

  get currentDir() {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  startChat() {
    if (this.usernameForm.invalid) {
      const errors = this.usernameForm.controls['username'].errors;
      let message = '';
      if (errors?.['required']) message = this.translate.instant('HOME.ERROR_REQUIRED');
      else if (errors?.['minlength']) message = this.translate.instant('HOME.ERROR_MINLENGTH');
      else if (errors?.['maxlength']) message = this.translate.instant('HOME.ERROR_MAXLENGTH');
      else if (errors?.['pattern']) message = this.translate.instant('HOME.ERROR_PATTERN');

      Swal.fire({
        icon: 'error',
        title: this.translate.instant('HOME.ERROR_TITLE'),
        text: message
      });
      return;
    }

    const name = this.usernameForm.value.username.trim();
    if (!name) return;

    fetch('sayhelloserver-production.up.railway.app/start-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to start chat');
        return res.json();
      })
      .then(data => {
        const token = data.token;
        this.router.navigate(['/chat'], { queryParams: { token, name } });
      })
      .catch(err => {
        console.error(err);
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('HOME.ERROR_TITLE'),
          text: this.translate.instant('HOME.ERROR_SERVER')
        });
      });
  }

  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
}


