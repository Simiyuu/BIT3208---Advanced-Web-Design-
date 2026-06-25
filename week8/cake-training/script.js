const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
const navItems = document.querySelectorAll('.nav-item');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('active');
  
  const icon = hamburger.querySelector('i');
  if(navLinks.classList.contains('active')) {
    icon.classList.remove('fa-bars');
    icon.classList.add('fa-times');
  } else {
    icon.classList.remove('fa-times');
    icon.classList.add('fa-bars');
  }
});

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navLinks.classList.remove('active');
    hamburger.querySelector('i').classList.remove('fa-times');
    hamburger.querySelector('i').classList.add('fa-bars');
  });
});