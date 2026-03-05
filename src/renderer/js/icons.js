// icons.js - SVG Icons configuration
const ICONS = {
  edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.333 2.00004C11.5081 1.82494 11.716 1.68605 11.9447 1.59129C12.1735 1.49653 12.4187 1.44775 12.6663 1.44775C12.914 1.44775 13.1592 1.49653 13.3879 1.59129C13.6167 1.68605 13.8246 1.82494 13.9997 2.00004C14.1748 2.17513 14.3137 2.383 14.4084 2.61178C14.5032 2.84055 14.552 3.08575 14.552 3.33337C14.552 3.58099 14.5032 3.82619 14.4084 4.05497C14.3137 4.28374 14.1748 4.49161 13.9997 4.66671L4.99967 13.6667L1.33301 14.6667L2.33301 11L11.333 2.00004Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  view: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0.666016 8.00004C0.666016 8.00004 3.33268 2.66671 7.99935 2.66671C12.666 2.66671 15.3327 8.00004 15.3327 8.00004C15.3327 8.00004 12.666 13.3334 7.99935 13.3334C3.33268 13.3334 0.666016 8.00004 0.666016 8.00004Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  delete: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 4H3.33333H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.33301 4.00004V2.66671C5.33301 2.31309 5.47348 1.97395 5.72353 1.7239C5.97358 1.47385 6.31272 1.33337 6.66634 1.33337H9.33301C9.68663 1.33337 10.0258 1.47385 10.2758 1.7239C10.5259 1.97395 10.6663 2.31309 10.6663 2.66671V4.00004M12.6663 4.00004V13.3334C12.6663 13.687 12.5259 14.0261 12.2758 14.2762C12.0258 14.5262 11.6866 14.6667 11.333 14.6667H4.66634C4.31272 14.6667 3.97358 14.5262 3.72353 14.2762C3.47348 14.0261 3.33301 13.687 3.33301 13.3334V4.00004H12.6663Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.66699 7.33337V11.3334" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.33301 7.33337V11.3334" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  calendar: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.6667 2.66671H3.33333C2.59695 2.66671 2 3.26366 2 4.00004V13.3334C2 14.0698 2.59695 14.6667 3.33333 14.6667H12.6667C13.403 14.6667 14 14.0698 14 13.3334V4.00004C14 3.26366 13.403 2.66671 12.6667 2.66671Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10.667 1.33337V4.00004" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.33301 1.33337V4.00004" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 6.66671H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  pending: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  </svg>`,
  
  inProgress: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3L12 8L5 13V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="currentColor"/>
  </svg>`,
  
  testing: `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" version="1.1" x="0px" y="0px" viewBox="0 0 100 100"><path d="M72.4,43.4L65,35l2.2-11l17.3-4.6c-6-7.5-16.1-11.2-26-8.6c-13.3,3.6-21.3,17.3-17.7,30.6c0.2,0.9,0.5,1.8,0.9,2.7 L12.9,72.9C9,76.8,9,83.2,12.9,87.1c3.9,3.9,10.2,3.9,14.1,0l28.8-28.8c4.8,1.9,10.2,2.3,15.6,0.9c9.9-2.7,16.8-10.9,18.3-20.4 L72.4,43.4z M20,85c-2.8,0-5-2.2-5-5s2.2-5,5-5s5,2.2,5,5S22.8,85,20,85z" fill="currentColor"></path></svg>
    `,
  
  completed: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  add: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3.33337V12.6667" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.33301 8H12.6663" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  arrow: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.33301 8H12.6663" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 3.33337L12.6667 8.00004L8 12.6667" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  clipboard: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3333 3.33337H15.8333C16.2754 3.33337 16.6993 3.50897 17.0118 3.82153C17.3244 4.13409 17.5 4.55801 17.5 5.00004V16.6667C17.5 17.1087 17.3244 17.5327 17.0118 17.8452C16.6993 18.1578 16.2754 18.3334 15.8333 18.3334H4.16667C3.72464 18.3334 3.30072 18.1578 2.98816 17.8452C2.67559 17.5327 2.5 17.1087 2.5 16.6667V5.00004C2.5 4.55801 2.67559 4.13409 2.98816 3.82153C3.30072 3.50897 3.72464 3.33337 4.16667 3.33337H6.66667" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.5 1.66663H7.5C7.04167 1.66663 6.66667 2.04163 6.66667 2.49996V4.16663C6.66667 4.62496 7.04167 4.99996 7.5 4.99996H12.5C12.9583 4.99996 13.3333 4.62496 13.3333 4.16663V2.49996C13.3333 2.04163 12.9583 1.66663 12.5 1.66663Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  dashboard: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.5 2.5H2.5V7.5H7.5V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.5 2.5H12.5V7.5H17.5V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.5 12.5H12.5V17.5H17.5V12.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7.5 12.5H2.5V17.5H7.5V12.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  folder: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.3333 15.8334C18.3333 16.2754 18.1577 16.6993 17.8452 17.0119C17.5326 17.3244 17.1087 17.5 16.6667 17.5H3.33333C2.89131 17.5 2.46738 17.3244 2.15482 17.0119C1.84226 16.6993 1.66667 16.2754 1.66667 15.8334V4.16671C1.66667 3.72468 1.84226 3.30076 2.15482 2.9882C2.46738 2.67564 2.89131 2.50004 3.33333 2.50004H7.5L9.16667 5.00004H16.6667C17.1087 5.00004 17.5326 5.17564 17.8452 5.4882C18.1577 5.80076 18.3333 6.22468 18.3333 6.66671V15.8334Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
};

// Función auxiliar para insertar iconos
function getIcon(name) {
  return ICONS[name] || '';
}
