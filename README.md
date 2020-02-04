# sweet

This is the code for sweet, a [lightweight social network you can use right now](https://sweet.sh). sweet runs on Node, Express, and MongoDB. The frontend uses jQuery and Bootstrap.

The code is uploaded here in the hopes it can be made more secure, more efficient, and more true to sweet's principles of safety, privacy, and community through the work of other coders.

If you see a serious safety breach, particularly one involving user data, please submit an issue or - even better - a fix, and I'll upload the updated code to the server as soon as I can. Your support is genuinely appreciated.

sweet has been an extremely uphill learning experience for me - I'm entirely self-taught, and am acutely aware that this code is a mess in need of major editing and potentially re-writing. If you'd like to help out, you can find some planned and in-progress work on the [Trello](https://trello.com/b/wzCmHAqi/sweet-development) and more current stuff on the incomplete [functional specification](https://docs.google.com/document/d/1R6jw7jHLAzM-PkLaNzbyalOqKVmUIEzNyhNHpMMlj10/edit?usp=sharing) - get in touch, because I'd love your help.

## Running in local dev

Install mongodb however you prefer. On OS X with Homebrew, that's:

```
brew install mongodb-community
brew services start mongodb-community
```

Then run `yarn` to install dependencies, then `yarn start` to start the server. Go to `http://localhost:8686` to see it running!

If you do anything that triggers an email, it won't get sent for real in local dev, it'll just get output into your console.

You need to prepopulate the users collection with Sweetbot to let logins work. Something like:

```
db.users.insert({
  _id: ObjectId("5c962bccf0b0d14286e99b68"),
  joined: Date.now(),
  lastOnline: Date.now(),
  lastUpdated: Date.now(),
  isVerified: false,
  verificationToken: '',
  verificationTokenExpiry: Date.now(),
  email: 'sweetbo@example.com',
  username: 'sweetbot',
  password: 'invalid password hash',
  passwordResetToken: '',
  passwordResetTokenExpiry: Date.now(),
  image: '',
  imageEnabled: false,
  displayName: 'SweetBot',
  pronouns: 'bot/bot',
  aboutRaw: '',
  aboutParsed: '',
  websiteRaw: '',
  websiteParsed: '',
  location: '',
  notifications: [],
  pushNotifSubscriptions: [],
  communities: [],
  bannedCommunities: [],
  mutedCommunities: [],
  hiddenRecommendedUsers: [],
  hiddenRecommendedCommunities: [],
  settings: {
    timezone: "auto",
    autoDetectedTimeZone: "",
    profileVisibility: "invisible",
    newPostPrivacy: "public",
    imageQuality: "standard",
    homeTagTimelineSorting: "fluid",
    userTimelineSorting: "chronological",
    communityTimelineSorting: "fluid",
    flashRecentComments: true,
    digestEmailFrequency: "off",
    emailTime: "17:00",
    emailDay: "Sunday",
    showRecommendations: true,
    showHashtags: true,
    sendMentionEmails: true,
  }
})
```
