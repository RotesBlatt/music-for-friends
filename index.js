// Referenz: https://gabrieltanner.org/blog/dicord-music-bot
// Discord V12 Docs: https://v12.discordjs.guide/voice/

const Discord = require("discord.js")
const ytdl = require("ytdl-core")
const ytpl = require("ytpl")
const ytsr = require("ytsr")

const {prefix, token} = require("./config.json")

const queue = new Map() 
const client = new Discord.Client()

var dispatcher = null
var timeout = null


client.on('ready', () => {
  console.log(`Logged in as '${client.user.tag}'`)
  console.log('Ready!') 
  client.user.setActivity(`Prefix: ${prefix}`, {type: 'WATCHING'})
})

client.once('reconnecting', () => {
  console.log('Reconnecting!') 
}) 
client.once('disconnect', () => {
  console.log('Disconnect!') 
}) 

client.on("message", async message => {
    if (message.author.bot) return 
    if (!message.content.startsWith(prefix)) return 
    const serverQueue = queue.get(message.guild.id) 

    if (message.content.split(" ")[0] == `${prefix}ping`) {
      const pinged = message.mentions.members.first() 
      if (pinged === undefined){
        message.reply(`Who do you want to ping?`)
        return
      }
      message.channel.send(`You've been summoned ${pinged}!`)
      return
    } else if (message.content.split(" ")[0] == `${prefix}pause`) {
      pause(message, serverQueue)
      return
    } else if (message.content.split(" ")[0] == `${prefix}play` || message.content.split(" ")[0] == `${prefix}p`) {
      execute(message, serverQueue) 
      return 
    } else if (message.content.split(" ")[0] == `${prefix}stop`) {
      stop(message, serverQueue) 
      return     
    } else if (message.content.split(" ")[0] == `${prefix}skip` || message.content.split(" ")[0] == `${prefix}s`) {
      skip(message, serverQueue) 
      return 
    } else if (message.content.split(" ")[0] == `${prefix}resume`) {
      resume(message, serverQueue)
      return
    } else if (message.content.split(" ")[0] == `${prefix}join`) {
      join(message)
      return
    } else if (message.content.split(" ")[0] == `${prefix}leave`) {
      leaveVoiceChannel(message, serverQueue)
      return
    } else if (message.content.split(" ")[0] == `${prefix}help`) {
      help(message)
      return
    } else if (message.content.split(" ")[0] == `${prefix}queue` || message.content.split(" ")[0] == `${prefix}q`) {
      listQueue(message, serverQueue)
      return
    } else if (message.content.split(" ")[0] == `${prefix}np`) {
      listCurrentPlayingSong(message, serverQueue)
      return
    }  else if(message.content.split(" ")[0] == `${prefix}qloop` || message.content.split(" ")[0] == `${prefix}queueloop`){
      loopCurrentSongQueue(message, serverQueue)
      return
    } else if(message.content.split(" ")[0] == `${prefix}loop`){
      loopCurrentSong(message, serverQueue)
      return
    } else {
      console.log(`[INFO] User: ${message.author.tag} used an invalid Command`)
      message.channel.send("You need to enter a valid command!") 
      return
    }
  }) 
  
  async function execute(message, serverQueue) {
    const args = message.content.split(" ")
    
    var userInput = ""
    args.forEach(function (element,i) {
      if(i == 0) return
      userInput = userInput + `${element} `
    })
    
    const voiceChannel = message.member.voice.channel 
    if (!voiceChannel)
      return message.channel.send("You need to be in a voice channel to play music!") 
    const permissions = voiceChannel.permissionsFor(message.client.user) 
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
      return message.channel.send("I need the permissions to join and speak in your voice channel!") 
    }

    if(!await ytdl.validateURL(userInput) && !await ytpl.validateID(userInput)){
      const filter = await ytsr.getFilters(userInput)
      const filters = filter.get("Type").get("Video")

      console.log(`[INFO] Fetching Video Information from input`)
      const searchResults = await ytsr(filters.url, {pages: 1})
      const songInfo = await ytdl.getInfo(searchResults.items[0].url)
      enqueueSongs(message, serverQueue, songInfo, false)
      return
    }

    try {
      console.log(`[INFO] Fetching Video Information`)
      const songInfo = await ytdl.getInfo(userInput) 
      enqueueSongs(message, serverQueue, songInfo, false)
      return
    } catch (error) {
      console.log(`[INFO] Video URL Invalid`)
    }

    try {
      console.log(`[INFO] Fetching Playlist Information`)
      const songInfo = await ytpl.getPlaylistID(userInput)
      enqueueSongs(message, serverQueue, songInfo, true)
    } catch (error) {
      console.log(`[INFO] Playlist URL Invalid`)      
    }   
  }

  async function enqueueSongs(message, serverQueue, songInfo, isPlaylist){
    const voiceChannel = message.member.voice.channel

    var firstResult = null
    var song = null

    if(isPlaylist){
      firstResult = await ytpl(songInfo, {pages: 1})
    } else {
      song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
        requestedBy: message.author.tag,
      } 
    }

    if(!serverQueue){

      var queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
        timeoutTimer: 5000,
        timeout: null,
        loopSong: false,
        loopSongQueue: false,
        currentSongQueue: [],
        currentSongQueueIndex: 1
      } 

      queue.set(message.guild.id, queueContruct)

      if(isPlaylist) {
        pushSongsToQueue(message, firstResult, queueContruct)
        console.log(`[INFO] User: ${message.author.tag} added ${firstResult.items.length} songs to the queue`)
        message.channel.send(`${queueContruct.songs.length} songs have been added to the queue`)
      } else {
        queueContruct.songs.push(song)
        console.log(`[INFO] User: ${message.author.tag} added song: ${song.title} to the Queue`)
      }
      
      await joinVoice(voiceChannel, message, queueContruct)
      queueContruct.currentSong = await ytdl(song.url)

    } else {
      if(!client.voice.connections.size > 0){
        await joinVoice(voiceChannel, message, serverQueue)
      }

      if(isPlaylist){
        pushSongsToQueue(message, firstResult, serverQueue)
        console.log(`[INFO] User: ${message.author.tag} added ${firstResult.items.length} songs to the queue`)
        return message.channel.send(`${firstResult.items.length} songs have been added to the queue!`)
      } else {
        serverQueue.songs.push(song)
        console.log(`[INFO] User: ${message.author.tag} added song: ${song.title} to the Queue`)
        return message.channel.send(`**${song.title}** has been added to the queue!`) 
      }
    }   
  }

  function pushSongsToQueue(message, firstResult, queue){
    firstResult.items.forEach(element => {
      const song = {
        title: element.title,
        url: element.url,
        requestedBy: message.author.tag,
      }
      queue.songs.push(song)
    })
  }

  async function joinVoice(voiceChannel, message, queueContruct){
    try {
      console.log("[INFO] Joining Voicechannel")
      const connection = await voiceChannel.join() 
      queueContruct.connection = connection
      playFromURL(message, queueContruct.songs[0]) 
    } catch (err) {
      console.log(err) 
      queue.delete(message.guild.id) 
      return message.channel.send(err) 
    }
  } 

  async function join(message){
    const voiceChannel = message.member.voice.channel
    if (!voiceChannel)
      return message.channel.send("You have to be in a voice channel to let the bot join a voice channel") 

    try {
      await voiceChannel.join()
      console.log(`[INFO] Joined a voice channel`)
      message.channel.send(`Joined the voice channel: ${message.member.voice.channel}`)
    } catch (err) {
      console.log(err) 
      return message.channel.send(err)
    }
  }

  function leaveVoiceChannel(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to let me leave!") 
    
    leaveVoiceAfterXSeconds(message, 10, true)
   
    if(!serverQueue)
      return message.channel.send(`Leaving ${message.member.voice.channel}`)

    serverQueue.songs = []
    serverQueue.loopSong = false
    serverQueue.loopSongQueue = false
    serverQueue.currentSongQueue = []
    serverQueue.currentSongQueueIndex = 1
    dispatcher.end()
    return message.channel.send(`Leaving ${message.member.voice.channel}`) 
  }

  function leaveVoiceAfterXSeconds(message, time, immediate){
    console.log(`[INFO] Leaving Voice Channel`)
    if(immediate) {
      message.guild.me.voice.channel.leave()
      return
    }
    if(!client.voice.connections.size > 0){
      console.log(`[INFO] Already Disconnected`)
      return
    }
    timeout = setTimeout(function () {
      message.guild.me.voice.channel.leave()
    }, time)
  }

  function loopCurrentSong(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to loop the song!") 
    if (!serverQueue)
      return message.channel.send("There is no song that I could loop!")
    
    if(serverQueue.loopSongQueue){
      serverQueue.loopSongQueue = false
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
      serverQueue.currentSongQueueIndex = 1
      serverQueue.currentSongQueue = []
      message.channel.send("Disabled SongQueue Looping")
    }

    serverQueue.loopSong = !serverQueue.loopSong
    console.log(`[INFO] Changed Song Loop Status to ${serverQueue.loopSong}`)
    if(serverQueue.loopSong){
      console.log(`[INFO] Looping song: ${serverQueue.songs[0].title}`)
      message.channel.send(`Enabled Song Looping` )
    } else {
      message.channel.send(`Disabled Song Looping` )
    }
    
  }

  function loopCurrentSongQueue(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to loop the songqueue!") 
    if (!serverQueue)
      return message.channel.send("There is no songqueue that I could loop!")

    if(serverQueue.loopSong){
      serverQueue.loopSong = false
      message.channel.send("Disabled Song Looping")
    }


    serverQueue.loopSongQueue = !serverQueue.loopSongQueue
    console.log(`[INFO] Changed current SongQueue Loop Status to ${serverQueue.loopSongQueue}`)
    if(serverQueue.loopSongQueue){
      console.log(`[INFO] Looping current SongQueue`)
      message.channel.send(`Enabled SongQueue Looping` )

      serverQueue.currentSongQueue = serverQueue.songs
      serverQueue.currentSongQueueIndex = 2
    } else {
      message.channel.send(`Disabled songqueue Looping` )
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
      serverQueue.currentSongQueue = []
      serverQueue.currentSongQueueIndex = 1 
    }
  }

  function shiftSongQueueToIndex(serverQueue, index){
    serverQueue.songs.forEach(function (i) {
      if(i >= index) return
      serverQueue.songs.shift()
      i = i + 1
      console.log(`Shifting: ${i}`)
    })
  }
  
  
  function skip(message, serverQueue) {
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to stop the music!") 
    if (!serverQueue)
      return message.channel.send("There is no song that I could skip!") 

    
    if(!serverQueue.loopSong && serverQueue.loopSongQueue){
      
    } else if(serverQueue.loopSong && !serverQueue.loopSongQueue){
      
    } else {
      serverQueue.songs.shift()
    }
 
    dispatcher.end()
    console.log(`[INFO] User: ${message.author.tag} skipped a Song`)
  }
  
  function stop(message, serverQueue) {
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to stop the music!") 
      
    if (!serverQueue)
      return message.channel.send("There is no song that I could stop!") 
    
    console.log(`[INFO] Stopped Playing Music and Cleared the Songqueue`)
    message.channel.send(`Cleared the queue and stopped playing`)
    serverQueue.songs = []
    serverQueue.loopSong = false
    serverQueue.loopSongQueue = false
    serverQueue.currentSongQueue = []
    serverQueue.currentSongQueueIndex = 1
    dispatcher.end() 
  }
  
  async function playFromURL(message, song) {
    const serverQueue = queue.get(message.guild.id) 
    
    if(timeout != null) {
      console.log(`[INFO] Clearing Timeout of ${serverQueue.timeoutTimer/1000}s`)
      clearTimeout(timeout)
    } 

    if (!song) {
      console.log(`[INFO] No more songs in Queue`)
      queue.delete(message.guild.id) 
      console.log(`[INFO] Setting Timeout to ${serverQueue.timeoutTimer/1000}s`)
      timeout = setTimeout(function(){
        leaveVoiceAfterXSeconds(message, serverQueue.timeoutTimer, false)
      }, serverQueue.timeoutTimer*100)
      return 
    }

    
      
    dispatcher = serverQueue.connection
      .play(ytdl(song.url, {filter: 'audioonly'}))
      .on('finish', () => {
        
        if(serverQueue.loopSongQueue){
          if(serverQueue.currentSongQueueIndex > serverQueue.currentSongQueue.length){
            serverQueue.currentSongQueueIndex = 1  
          }
          console.log(`Index before Playing ${serverQueue.currentSongQueueIndex}`)
          playFromURL(message, serverQueue.currentSongQueue[serverQueue.currentSongQueueIndex-1])
          serverQueue.currentSongQueueIndex += 1
          console.log(`Index after Playing ${serverQueue.currentSongQueueIndex}`)
        } else if(serverQueue.loopSong) {
          playFromURL(message, serverQueue.songs[0])
        } else {
          serverQueue.songs.shift()
          playFromURL(message, serverQueue.songs[0]) 
        }
      })
      .on("error", error => {
        try {
          throw new Error();
        } catch {
          dispatcher.end()
          message.channel.send(`There was an error playing this song, skipping ahead `)
          console.error(error)
          return
        }
      })

    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5) 
    if(!serverQueue.loopSong){
      console.log(`[INFO] Now playing: ${song.title} requested by ${song.requestedBy}`)
      serverQueue.textChannel.send(`Now playing: **${song.title}**`) 
    }
    
  }

  function pause(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to pause the music!") 
      
    if (!serverQueue)
      return message.channel.send("There is no song that I could pause!") 

    console.log(`[INFO] Pausing song`)
    dispatcher.pause()
  }

  function resume(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to resume the music!") 
      
    if (!serverQueue)
      return message.channel.send("There is no song that I could resume!") 

    console.log(`[INFO] Resuming song`)
    dispatcher.resume()
  }

  function help(message){
    console.log(`[INFO] Sending user Help`)
    //TODO: Send user a private dm which contains information about how to use this bot
    message.author.send(`
    **Welcome to Music for Friends, ${message.author.tag.split("#")[0]}!**
    This is going to help you when im finished with the basic command stuff    
    `)
    message.channel.send(`Calling 911...`)
  }

  function listQueue(message, serverQueue){
    if(!serverQueue){
      console.log(`[INFO] No Songs in the Queue`)
      return message.channel.send(`There are no songs Playing atm`)
    }

    console.log(`[INFO] Listing the enqueued Song List: `)

    var out = "```"
    serverQueue.songs.forEach(function (element,i) {
      if(i > 9) return
      console.log(`${i+1}. ${element.title}`)
      out = `${out}${i+1}. ${element.title}\n`
    });
    
    if(serverQueue.songs.length > 10){
      out = out + `NOTE: There are ${serverQueue.songs.length} songs in the Queue`
      console.log(`[INFO] Songs in Queue: ${serverQueue.songs.length}`)
    }
    out = out + '```'
    message.channel.send(`Songs in the Queue: \n${out}`)
  }

  function listCurrentPlayingSong(message, serverQueue){
    if(!serverQueue){
      console.log(`[INFO] No Songs in the Queue`)
      return message.channel.send(`There are no songs Playing atm`)
    }

    console.log(`[INFO] Listing current playing song: ${serverQueue.songs[0].title} requested by ${serverQueue.songs[0].requestedBy}`)
    message.channel.send(`Currently playing: **${serverQueue.songs[0].title}**`)
  }

client.login(token)

//TODO: Looping functionality (loop current Queue and/or loop current song)
//TODO: Download attached files (if mp3) and save them to be played later (https://stackoverflow.com/questions/51550993/download-file-to-local-computer-sent-attatched-to-message-discord/51565540)
//TODO: Play downloaded mp3's via command (search for name input?)
//TODO: Figure out how to play Songs from Spotify
//TODO: Mute the player, but the song plays on
//TODO: Clip abspielen bevor der Bot den Channel verlässt (https://www.youtube.com/watch?v=r5sTTlph2Vk)
//TODO: CHeck for error (!p !p https://www.youtube.com/watch?v=r5sTTlph2Vk)
//TODO: Skip specific songs (!skip 4)
//TODO: Remove specific songs (!remove 2)