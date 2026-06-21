// Test script to verify protocol registration
const { exec } = require('child_process');

console.log('Testing protocol registration...\n');

// Test 1: Check registry
console.log('1. Checking Windows Registry...');
exec(
  'reg query HKCU\\Software\\Classes\\fightplanner',
  (error, stdout, stderr) => {
    if (error) {
      console.log('   ❌ Protocol NOT found in registry');
      console.log('   Error:', error.message);
    } else {
      console.log('   ✅ Protocol found in registry');
      console.log(stdout);
    }

    // Test 2: Check command registration
    console.log('\n2. Checking command registration...');
    exec(
      'reg query HKCU\\Software\\Classes\\fightplanner\\shell\\open\\command',
      (error, stdout, stderr) => {
        if (error) {
          console.log('   ❌ Command NOT registered');
        } else {
          console.log('   ✅ Command registered');
          console.log(stdout);
        }

        // Test 3: Try to launch protocol
        console.log('\n3. Testing protocol launch...');
        console.log('   Run this command in PowerShell to test:');
        console.log(
          '   start "fightplanner:https://gamebanana.com/mmdl/1549678,Mod,630054,zip"',
        );

        console.log('\n✅ Tests complete!');
        console.log(
          '\nIf protocol is not registered, try running FightPlanner as Administrator once.',
        );
      },
    );
  },
);
